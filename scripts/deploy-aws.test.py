#!/usr/bin/env python3
"""Offline deployment checks. No AWS requests, credentials or Docker daemon needed."""

import copy
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location(
    "deploy_aws", Path(__file__).with_name("deploy-aws.py")
)
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

ARN = "arn:aws:apprunner:us-east-1:123456789012:service/quickbite-frontend/" + "a" * 32
BASE = [
    "--account-id",
    "123456789012",
    "--region",
    "us-east-1",
    "--service-name",
    "quickbite-frontend",
    "--repository",
    "quickbite-frontend",
    "--image-tag",
    "release-123",
    "--backend-origin",
    "https://api.example.com",
]


def args(*extra):
    return deploy.arguments(BASE + ["--service-arn", ARN] + list(extra))


def frontend():
    return {
        "ServiceArn": ARN,
        "ServiceName": "quickbite-frontend",
        "ServiceUrl": "frontend.awsapprunner.com",
        "Status": "RUNNING",
        "UpdatedAt": "2026-09-14T01:00:00Z",
        "InstanceConfiguration": {"Cpu": "1024", "Memory": "2048"},
        "NetworkConfiguration": {
            "EgressConfiguration": {
                "EgressType": "VPC",
                "VpcConnectorArn": "existing-connector",
            }
        },
        "SourceConfiguration": {
            "AutoDeploymentsEnabled": True,
            "AuthenticationConfiguration": {"AccessRoleArn": "existing-access-role"},
            "ImageRepository": {
                "ImageRepositoryType": "ECR",
                "ImageIdentifier": "123456789012.dkr.ecr.us-east-1.amazonaws.com/quickbite-frontend:old",
                "ImageConfiguration": {
                    "Port": "8080",
                    "RuntimeEnvironmentVariables": {
                        "BACKEND_ORIGIN": "https://old.example.com",
                        "OTHER_SETTING": "keep",
                    },
                    "RuntimeEnvironmentSecrets": {
                        "EXISTING_SECRET": "arn:aws:secretsmanager:us-east-1:123456789012:secret:reference"
                    },
                },
            },
        },
    }


class DeploymentTests(unittest.TestCase):
    def test_plan_is_offline_and_is_default(self):
        with (
            patch.object(
                deploy, "aws", side_effect=AssertionError("Unexpected AWS call")
            ),
            patch.object(
                deploy, "preflight", side_effect=AssertionError("Unexpected preflight")
            ),
            patch("sys.stdout", new_callable=io.StringIO) as output,
        ):
            deploy.main(BASE + ["--service-arn", ARN])
        self.assertIn("Offline plan only", output.getvalue())
        self.assertNotIn("Frontend deployed:", output.getvalue())

    def test_rejects_unsafe_or_unreachable_backend_origins(self):
        for origin in [
            "http://api.example.com",
            "https://localhost",
            "https://host.docker.internal",
            "https://127.0.0.1",
            "https://user:pass@api.example.com",
            "https://api.example.com/path",
            "https://api.example.com?token=secret",
            "https://api.example.com;",
            "https://api.example.com\nother",
            "https://api.example.com:0",
        ]:
            with self.subTest(origin=origin), self.assertRaises(deploy.DeploymentError):
                args("--backend-origin", origin)

    def test_normalizes_trailing_slash(self):
        self.assertEqual(
            args("--backend-origin", "https://api.example.com/").backend_origin,
            "https://api.example.com",
        )

    def test_rejects_wrong_account_region_or_service_arn(self):
        for arn in [
            ARN.replace("123456789012", "222222222222"),
            ARN.replace("us-east-1", "us-east-2"),
            ARN.replace("quickbite-frontend", "quickbite-backend"),
        ]:
            with self.subTest(arn=arn), self.assertRaises(deploy.DeploymentError):
                args("--service-arn", arn)

    def test_creation_requires_explicit_bootstrap_stack(self):
        with self.assertRaises(deploy.DeploymentError):
            deploy.arguments(BASE + ["--create-service"])

    def test_rejects_unmarked_or_backend_services(self):
        with self.assertRaises(deploy.DeploymentError):
            deploy.validate_service(args(), frontend(), {})
        service = frontend()
        service["SourceConfiguration"]["ImageRepository"]["ImageIdentifier"] = (
            "123456789012.dkr.ecr.us-east-1.amazonaws.com/quickbite-backend:old"
        )
        with self.assertRaises(deploy.DeploymentError):
            deploy.validate_service(
                args(), service, {"quickbite:component": "frontend"}
            )

    def test_rejects_self_proxy_and_overridden_start_command(self):
        with self.assertRaises(deploy.DeploymentError):
            deploy.validate_service(
                args("--backend-origin", "https://frontend.awsapprunner.com"),
                frontend(),
                {"quickbite:component": "frontend"},
            )
        service = frontend()
        service["SourceConfiguration"]["ImageRepository"]["ImageConfiguration"][
            "StartCommand"
        ] = "java -jar server.jar"
        with self.assertRaises(deploy.DeploymentError):
            deploy.validate_service(
                args(), service, {"quickbite:component": "frontend"}
            )

    def test_update_preserves_settings_secrets_and_original_object(self):
        service = frontend()
        original = copy.deepcopy(service)
        deploy.validate_service(args(), service, {"quickbite:component": "frontend"})
        payload = deploy.service_request(args(), service)
        expected_source = copy.deepcopy(service["SourceConfiguration"])
        expected_source["ImageRepository"]["ImageIdentifier"] = (
            deploy.repository_uri(args()) + ":release-123"
        )
        expected_source["ImageRepository"]["ImageConfiguration"][
            "RuntimeEnvironmentVariables"
        ]["BACKEND_ORIGIN"] = "https://api.example.com"
        self.assertEqual(
            payload, {"ServiceArn": ARN, "SourceConfiguration": expected_source}
        )
        self.assertEqual(service, original)

    def test_create_config_uses_live_proxy_health_and_frontend_tag(self):
        payload = deploy.service_request(args(), access_role="role-arn")
        self.assertEqual(payload["HealthCheckConfiguration"]["Path"], "/health")
        self.assertEqual(
            payload["SourceConfiguration"]["ImageRepository"]["ImageConfiguration"][
                "Port"
            ],
            "8080",
        )
        self.assertEqual(
            payload["Tags"], [{"Key": "quickbite:component", "Value": "frontend"}]
        )
        self.assertFalse(payload["SourceConfiguration"]["AutoDeploymentsEnabled"])

    def test_check_never_builds_pushes_or_deploys(self):
        with (
            patch.object(deploy, "preflight", return_value=(frontend(), None)),
            patch.object(
                deploy, "aws", side_effect=AssertionError("Unexpected AWS mutation")
            ),
            patch.object(
                deploy, "push_image", side_effect=AssertionError("Unexpected push")
            ),
            patch("sys.stdout", new_callable=io.StringIO),
        ):
            deploy.main(BASE + ["--service-arn", ARN, "--check"])

    def test_failed_operation_never_reports_success(self):
        with (
            patch.object(
                deploy,
                "aws",
                return_value={
                    "OperationSummaryList": [{"Id": "operation", "Status": "FAILED"}]
                },
            ),
            patch("sys.stdout", new_callable=io.StringIO) as output,
        ):
            with self.assertRaises(deploy.DeploymentError):
                deploy.wait_for_service(
                    args(), {"Service": frontend(), "OperationId": "operation"}
                )
        self.assertNotIn("Frontend deployed:", output.getvalue())

    def test_aws_wrapper_enforces_read_only_action_allowlist(self):
        with patch.object(
            deploy.subprocess, "run", side_effect=AssertionError("Unexpected command")
        ):
            with self.assertRaises(deploy.DeploymentError):
                deploy.aws(args("--check"), "apprunner", "update-service", payload={})
            with self.assertRaises(deploy.DeploymentError):
                deploy.aws(args(), "sts", "get-caller-identity")

    def test_preflight_calls_only_the_read_only_aws_allowlist(self):
        config = args("--check")
        calls = []

        def fake_aws(settings, service, action, *options, **kwargs):
            calls.append((service, action))
            self.assertIn((service, action), deploy.READ_ONLY_ACTIONS)
            if service == "sts":
                return {"Account": "123456789012"}
            if action == "describe-service":
                return {"Service": frontend()}
            if action == "list-tags-for-resource":
                return {"Tags": [{"Key": "quickbite:component", "Value": "frontend"}]}
            if action == "describe-repositories":
                return {
                    "repositories": [
                        {
                            "repositoryUri": deploy.repository_uri(config),
                            "imageTagMutability": "IMMUTABLE",
                        }
                    ]
                }
            if action == "describe-images":
                raise deploy.AwsError(service, action, "ImageNotFoundException")
            raise AssertionError("Unexpected read action")

        with (
            patch.object(deploy, "aws", side_effect=fake_aws),
            patch.object(deploy.shutil, "which", return_value="tool"),
            patch.object(
                deploy.subprocess, "run", return_value=MagicMock(returncode=0)
            ),
            patch("sys.stdout", new_callable=io.StringIO) as output,
        ):
            service, stack = deploy.preflight(config)
        self.assertEqual(service["ServiceArn"], ARN)
        self.assertIsNone(stack)
        self.assertEqual(len(calls), 5)
        self.assertNotIn("EXISTING_SECRET", output.getvalue())

    def test_operation_success_requires_matching_id_running_and_health(self):
        health = MagicMock()
        health.__enter__.return_value.status = 200
        health.__enter__.return_value.read.return_value = b"ok\n"
        responses = [
            {
                "OperationSummaryList": [
                    {"Id": "other", "Status": "FAILED"},
                    {"Id": "operation", "Status": "SUCCEEDED"},
                ]
            },
            {"Service": frontend()},
        ]
        with (
            patch.object(deploy, "aws", side_effect=responses),
            patch.object(deploy, "urlopen", return_value=health) as request,
            patch("sys.stdout", new_callable=io.StringIO) as output,
        ):
            deploy.wait_for_service(
                args(), {"Service": frontend(), "OperationId": "operation"}
            )
        request.assert_called_once_with(
            "https://frontend.awsapprunner.com/health", timeout=20
        )
        self.assertIn("Frontend deployed:", output.getvalue())

    def test_unhealthy_service_is_not_reported_as_deployed(self):
        health = MagicMock()
        health.__enter__.return_value.status = 200
        health.__enter__.return_value.read.return_value = b"unexpected"
        with (
            patch.object(
                deploy,
                "aws",
                side_effect=[
                    {
                        "OperationSummaryList": [
                            {"Id": "operation", "Status": "SUCCEEDED"}
                        ]
                    },
                    {"Service": frontend()},
                ],
            ),
            patch.object(deploy, "urlopen", return_value=health),
            patch("sys.stdout", new_callable=io.StringIO) as output,
        ):
            with self.assertRaises(deploy.DeploymentError):
                deploy.wait_for_service(
                    args(), {"Service": frontend(), "OperationId": "operation"}
                )
        self.assertNotIn("Frontend deployed:", output.getvalue())


if __name__ == "__main__":
    unittest.main()
