#!/usr/bin/env python3
"""Deploy only the QuickBite frontend. Default mode is an offline plan."""

import argparse
import copy
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "infra/aws/bootstrap.json"
READ_ONLY_ACTIONS = {
    ("sts", "get-caller-identity"),
    ("apprunner", "list-services"),
    ("apprunner", "describe-service"),
    ("apprunner", "list-tags-for-resource"),
    ("apprunner", "list-operations"),
    ("ecr", "describe-repositories"),
    ("ecr", "describe-images"),
    ("cloudformation", "describe-stacks"),
}


class DeploymentError(Exception):
    pass


class AwsError(DeploymentError):
    def __init__(self, service, action, code):
        self.code = code
        super().__init__(
            f"AWS {service}:{action} failed ({code}). Check the selected identity and permissions."
        )


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--plan",
        action="store_const",
        dest="mode",
        const="plan",
        help="Offline validation and deployment plan (default)",
    )
    modes.add_argument(
        "--check",
        action="store_const",
        dest="mode",
        const="check",
        help="Read-only AWS and local tool preflight",
    )
    modes.add_argument(
        "--apply",
        action="store_const",
        dest="mode",
        const="apply",
        help="Build, push and deploy to the explicit target",
    )
    parser.set_defaults(mode="plan")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--create-service", action="store_true")
    target.add_argument(
        "--service-arn", help="Existing, explicitly tagged frontend service ARN"
    )
    for key in [
        "account-id",
        "region",
        "service-name",
        "repository",
        "image-tag",
        "backend-origin",
    ]:
        parser.add_argument("--" + key, required=True)
    parser.add_argument(
        "--profile", help="AWS CLI profile; omit to use the existing credential chain"
    )
    parser.add_argument(
        "--bootstrap-stack",
        help="Explicit bootstrap stack name, required when creating a service",
    )
    parser.add_argument("--logout-path", default="/logout")
    parser.add_argument(
        "--reuse-image",
        action="store_true",
        help="Deploy an existing immutable tag, without rebuilding or pushing",
    )
    parser.add_argument(
        "--timeout", type=int, default=1200, help="Maximum deployment wait in seconds"
    )
    return validate(parser.parse_args(argv))


def require(condition, message):
    if not condition:
        raise DeploymentError(message)


def validate(args):
    require(
        re.fullmatch(r"\d{12}", args.account_id),
        "account-id must be a 12-digit AWS account ID.",
    )
    require(
        re.fullmatch(r"[a-z]{2}-[a-z]+-\d", args.region),
        "Use an explicit commercial AWS region, such as us-east-1.",
    )
    require(
        re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{3,39}", args.service_name),
        "service-name must contain 4 to 40 letters, numbers, hyphens or underscores.",
    )
    require(
        re.fullmatch(r"[a-z0-9]+(?:[._/-][a-z0-9]+)*", args.repository)
        and 2 <= len(args.repository) <= 256,
        "Invalid ECR repository name.",
    )
    require(
        re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}", args.image_tag),
        "Invalid image tag.",
    )
    try:
        origin = urlsplit(args.backend_origin)
        port = origin.port
        valid_origin = (
            origin.scheme == "https"
            and origin.hostname
            and origin.path in ("", "/")
            and not origin.query
            and not origin.fragment
            and not origin.username
            and not origin.password
        )
    except ValueError:
        valid_origin = False
    require(
        valid_origin and not re.search(r"[\s\\;$\"'{}]", args.backend_origin),
        "backend-origin must be an HTTPS origin without credentials, a path, query or fragment.",
    )
    require(
        origin.hostname not in ("localhost", "host.docker.internal", "127.0.0.1", "::1")
        and port != 0,
        "backend-origin must be reachable from AWS, not a local development host.",
    )
    args.backend_origin = args.backend_origin.rstrip("/")
    require(
        re.fullmatch(r"/(?!/)[A-Za-z0-9/_-]+", args.logout_path),
        "logout-path must be an absolute API path such as /logout.",
    )
    require(30 <= args.timeout <= 3600, "timeout must be between 30 and 3600 seconds.")
    if args.create_service:
        require(
            args.bootstrap_stack
            and re.fullmatch(r"[A-Za-z][A-Za-z0-9-]{0,127}", args.bootstrap_stack),
            "Creating a service requires an explicit valid --bootstrap-stack.",
        )
    else:
        expected = f"arn:aws:apprunner:{args.region}:{args.account_id}:service/{args.service_name}/"
        require(
            args.service_arn.startswith(expected)
            and re.fullmatch(r"[a-fA-F0-9]{32}", args.service_arn[len(expected) :]),
            "service-arn must match the explicit account, region and service name.",
        )
        require(
            not args.bootstrap_stack,
            "bootstrap-stack is only used when creating a service.",
        )
    return args


def repository_uri(args):
    return f"{args.account_id}.dkr.ecr.{args.region}.amazonaws.com/{args.repository}"


def aws(args, service, action, *options, payload=None, text=False):
    require(args.mode != "plan", "Offline plans cannot call AWS.")
    require(
        args.mode == "apply" or (service, action) in READ_ONLY_ACTIONS,
        "Read-only checks cannot call this AWS action.",
    )
    command = [
        "aws",
        service,
        action,
        *options,
        "--region",
        args.region,
        "--no-cli-pager",
        "--output",
        "text" if text else "json",
        "--cli-connect-timeout",
        "10",
        "--cli-read-timeout",
        "60",
    ]
    if args.profile:
        command += ["--profile", args.profile]
    # Existing source configuration may contain private runtime values. Never log it.
    with tempfile.TemporaryDirectory(prefix="quickbite-aws-") as directory:
        if payload is not None:
            request = Path(directory) / "request.json"
            request.write_text(json.dumps(payload))
            request.chmod(0o600)
            command += ["--cli-input-json", "file://" + str(request)]
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=180,
            env={**os.environ, "AWS_PAGER": ""},
        )
    if result.returncode:
        match = re.search(r"An error occurred \(([^)]+)\)", result.stderr)
        code = match.group(1) if match else "CLIError"
        raise AwsError(service, action, code)
    return result.stdout.strip() if text else json.loads(result.stdout or "{}")


def describe_stack(args):
    try:
        return aws(
            args,
            "cloudformation",
            "describe-stacks",
            "--stack-name",
            args.bootstrap_stack,
        )["Stacks"][0]
    except AwsError as error:
        if error.code == "ValidationError":
            return None
        raise


def validate_service(args, service, tags):
    require(
        service["ServiceArn"] == args.service_arn
        and service["ServiceName"] == args.service_name,
        "AWS returned a different service identity.",
    )
    require(
        tags.get("quickbite:component") == "frontend",
        "Refusing to update an unverified service. An administrator must first identify the actual frontend and tag it quickbite:component=frontend.",
    )
    require(
        service["Status"] == "RUNNING",
        "The existing frontend must be RUNNING before an update.",
    )
    image = service.get("SourceConfiguration", {}).get("ImageRepository", {})
    identifier = image.get("ImageIdentifier", "")
    require(
        image.get("ImageRepositoryType") == "ECR"
        and (
            identifier.startswith(repository_uri(args) + ":")
            or identifier.startswith(repository_uri(args) + "@")
        ),
        "Refusing to change a service that uses another repository or source type.",
    )
    config = image.get("ImageConfiguration", {})
    require(
        config.get("Port", "8080") == "8080",
        "Existing service port is not the frontend's port 8080.",
    )
    require(
        not config.get("StartCommand"),
        "Existing service overrides its start command. Review it before adopting this Nginx image.",
    )
    require(
        "BACKEND_ORIGIN" not in config.get("RuntimeEnvironmentSecrets", {}),
        "BACKEND_ORIGIN is secret-backed on this service. Resolve the conflicting setting before deployment.",
    )
    backend_host = urlsplit(args.backend_origin).hostname
    require(
        backend_host != service.get("ServiceUrl"),
        "The backend origin points at the frontend itself.",
    )


def preflight(args):
    require(shutil.which("aws"), "AWS CLI v2 is required.")
    require(shutil.which("docker"), "Docker is required.")
    identity = aws(args, "sts", "get-caller-identity")
    require(
        identity["Account"] == args.account_id,
        "Current AWS identity belongs to a different account. Select the correct profile or role.",
    )
    service = None
    stack = None
    if args.service_arn:
        service = aws(
            args, "apprunner", "describe-service", "--service-arn", args.service_arn
        )["Service"]
        tag_list = aws(
            args,
            "apprunner",
            "list-tags-for-resource",
            "--resource-arn",
            args.service_arn,
        )["Tags"]
        validate_service(
            args, service, {item["Key"]: item["Value"] for item in tag_list}
        )
    else:
        services = aws(args, "apprunner", "list-services").get("ServiceSummaryList", [])
        require(
            not any(item["ServiceName"] == args.service_name for item in services),
            "A service with this name already exists. Use its verified frontend ARN instead.",
        )
        stack = describe_stack(args)
        if stack:
            params = {
                p["ParameterKey"]: p["ParameterValue"]
                for p in stack.get("Parameters", [])
            }
            tags = {p["Key"]: p["Value"] for p in stack.get("Tags", [])}
            require(
                params.get("RepositoryName") == args.repository
                and tags.get("quickbite:component") == "frontend",
                "Existing bootstrap stack does not match this frontend. Refusing to modify it.",
            )
            require(
                stack["StackStatus"] in ("CREATE_COMPLETE", "UPDATE_COMPLETE"),
                "Bootstrap stack is not ready. Inspect its CloudFormation events.",
            )
    try:
        repository = aws(
            args, "ecr", "describe-repositories", "--repository-names", args.repository
        )["repositories"][0]
    except AwsError as error:
        if error.code != "RepositoryNotFoundException":
            raise
        repository = None
    require(
        repository or args.create_service,
        "The existing service's ECR repository was not found.",
    )
    if repository:
        require(
            repository["repositoryUri"] == repository_uri(args),
            "ECR repository account or region mismatch.",
        )
        require(
            repository.get("imageTagMutability") == "IMMUTABLE",
            "The deployment requires immutable ECR tags to preserve release and rollback artifacts.",
        )
        if args.create_service:
            outputs = {
                p["OutputKey"]: p["OutputValue"]
                for p in (stack or {}).get("Outputs", [])
            }
            require(
                outputs.get("RepositoryUri") == repository_uri(args),
                "Repository already exists outside the selected bootstrap stack. Use a new dedicated repository or an existing verified frontend service.",
            )
    image_exists = False
    if repository:
        try:
            aws(
                args,
                "ecr",
                "describe-images",
                "--repository-name",
                args.repository,
                "--image-ids",
                f"imageTag={args.image_tag}",
            )
            image_exists = True
        except AwsError as error:
            if error.code != "ImageNotFoundException":
                raise
    require(
        image_exists == args.reuse_image,
        "Use a new image tag to build a release, or --reuse-image only with an existing tag.",
    )
    docker = subprocess.run(["docker", "info"], capture_output=True, timeout=30)
    require(docker.returncode == 0, "Docker daemon is not available.")
    print(
        "Read-only preflight passed. Write permissions and App Runner customer eligibility are not established by this check."
    )
    return service, stack


def service_request(args, service=None, access_role=None):
    image = repository_uri(args) + ":" + args.image_tag
    if service:
        source = copy.deepcopy(service["SourceConfiguration"])
        source["ImageRepository"]["ImageIdentifier"] = image
        config = source["ImageRepository"].setdefault("ImageConfiguration", {})
        config.setdefault("RuntimeEnvironmentVariables", {})["BACKEND_ORIGIN"] = (
            args.backend_origin
        )
        # Omit instance, network, scaling, health and observability settings to retain them.
        return {"ServiceArn": args.service_arn, "SourceConfiguration": source}
    return {
        "ServiceName": args.service_name,
        "SourceConfiguration": {
            "AuthenticationConfiguration": {"AccessRoleArn": access_role},
            "AutoDeploymentsEnabled": False,
            "ImageRepository": {
                "ImageIdentifier": image,
                "ImageRepositoryType": "ECR",
                "ImageConfiguration": {
                    "Port": "8080",
                    "RuntimeEnvironmentVariables": {
                        "BACKEND_ORIGIN": args.backend_origin
                    },
                },
            },
        },
        "InstanceConfiguration": {"Cpu": "0.25 vCPU", "Memory": "0.5 GB"},
        "HealthCheckConfiguration": {
            "Protocol": "HTTP",
            "Path": "/health",
            "Interval": 10,
            "Timeout": 5,
            "HealthyThreshold": 1,
            "UnhealthyThreshold": 5,
        },
        "Tags": [{"Key": "quickbite:component", "Value": "frontend"}],
    }


def bootstrap(args, stack):
    if stack:
        return {p["OutputKey"]: p["OutputValue"] for p in stack["Outputs"]}[
            "ImageAccessRoleArn"
        ]
    print("Creating the explicitly named frontend bootstrap stack.")
    aws(
        args,
        "cloudformation",
        "create-stack",
        payload={
            "StackName": args.bootstrap_stack,
            "TemplateBody": TEMPLATE.read_text(),
            "Parameters": [
                {"ParameterKey": "RepositoryName", "ParameterValue": args.repository}
            ],
            "Capabilities": ["CAPABILITY_IAM"],
            "Tags": [{"Key": "quickbite:component", "Value": "frontend"}],
        },
    )
    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline:
        stack = describe_stack(args)
        status = stack["StackStatus"] if stack else "CREATE_IN_PROGRESS"
        if status == "CREATE_COMPLETE":
            return {p["OutputKey"]: p["OutputValue"] for p in stack["Outputs"]}[
                "ImageAccessRoleArn"
            ]
        require(
            status == "CREATE_IN_PROGRESS",
            "Bootstrap failed. Inspect CloudFormation stack events; no resources are automatically deleted by this script.",
        )
        time.sleep(10)
    raise DeploymentError("Bootstrap timed out. Inspect the stack before retrying.")


def push_image(args):
    if args.reuse_image:
        print("Reusing the selected immutable ECR image.")
        return
    image = repository_uri(args) + ":" + args.image_tag
    print("Building the live frontend image for Linux AMD64.")
    subprocess.run(
        [
            "docker",
            "build",
            "--platform",
            "linux/amd64",
            "--build-arg",
            "VITE_API_BASE_URL=/api",
            "--build-arg",
            "VITE_DEMO_MODE=false",
            "--build-arg",
            "VITE_LOGOUT_PATH=" + args.logout_path,
            "-t",
            image,
            str(ROOT),
        ],
        check=True,
    )
    # Keep the short-lived ECR token out of terminal output and global Docker config.
    token = aws(args, "ecr", "get-login-password", text=True)
    with tempfile.TemporaryDirectory(prefix="quickbite-docker-") as directory:
        env = {**os.environ, "DOCKER_CONFIG": directory}
        subprocess.run(
            [
                "docker",
                "login",
                "--username",
                "AWS",
                "--password-stdin",
                repository_uri(args).split("/")[0],
            ],
            input=token + "\n",
            text=True,
            check=True,
            env=env,
            capture_output=True,
        )
        subprocess.run(["docker", "push", image], check=True, env=env)


def wait_for_service(args, response):
    arn = response["Service"]["ServiceArn"]
    operation_id = response["OperationId"]
    print(f"Deployment started: {arn}; operation {operation_id}")
    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline:
        operations = aws(
            args, "apprunner", "list-operations", "--service-arn", arn
        ).get("OperationSummaryList", [])
        operation = next(
            (item for item in operations if item["Id"] == operation_id), None
        )
        if operation:
            status = operation["Status"]
            if status == "SUCCEEDED":
                service = aws(
                    args, "apprunner", "describe-service", "--service-arn", arn
                )["Service"]
                require(
                    service["Status"] == "RUNNING",
                    "Deployment operation succeeded, but service is not RUNNING.",
                )
                url = "https://" + service["ServiceUrl"]
                try:
                    with urlopen(url + "/health", timeout=20) as health:
                        require(
                            health.status == 200 and health.read(32).strip() == b"ok",
                            "Frontend health endpoint did not return ok.",
                        )
                except OSError as error:
                    raise DeploymentError(
                        "Service is RUNNING but /health was unreachable from this runner. Check ingress and service logs."
                    ) from error
                print(
                    f"Frontend deployed: {url}\nService ARN: {arn}\nFrontend /health passed. Live authentication and ordering still require validation against the existing backend."
                )
                return
            require(
                status in ("PENDING", "IN_PROGRESS"),
                f"App Runner deployment ended with {status}. Inspect deployment logs before retrying.",
            )
        time.sleep(10)
    raise DeploymentError(
        "App Runner deployment timed out. Inspect the recorded service ARN and operation before retrying."
    )


def main(argv=None):
    args = arguments(argv)
    json.loads(TEMPLATE.read_text())
    print(
        json.dumps(
            {
                "mode": args.mode,
                "account": args.account_id,
                "region": args.region,
                "service": args.service_arn or args.service_name,
                "create_service": args.create_service,
                "bootstrap_stack": args.bootstrap_stack,
                "image": repository_uri(args) + ":" + args.image_tag,
                "reuse_image": args.reuse_image,
                "backend_origin": args.backend_origin,
                "build_settings": (
                    "Retained from the selected existing image; verify its production provenance."
                    if args.reuse_image
                    else {
                        "api_base": "/api",
                        "demo": False,
                        "logout_path": args.logout_path,
                    }
                ),
            },
            indent=2,
        )
    )
    if args.mode == "plan":
        print(
            "Offline plan only. No AWS calls, Docker builds or resource changes were made."
        )
        return
    service, stack = preflight(args)
    if args.mode == "check":
        return
    role = bootstrap(args, stack) if args.create_service else None
    push_image(args)
    if service:
        # Re-read after building, rather than overwriting a concurrently edited source config.
        latest = aws(
            args, "apprunner", "describe-service", "--service-arn", args.service_arn
        )["Service"]
        require(
            latest["Status"] == "RUNNING"
            and latest.get("UpdatedAt") == service.get("UpdatedAt"),
            "Service changed while building. Retry a read-only check before deploying.",
        )
    action = "create-service" if args.create_service else "update-service"
    response = aws(
        args, "apprunner", action, payload=service_request(args, service, role)
    )
    wait_for_service(args, response)


if __name__ == "__main__":
    try:
        main()
    except (DeploymentError, subprocess.SubprocessError, OSError, ValueError) as error:
        print(f"Deployment stopped: {error}", file=sys.stderr)
        sys.exit(1)
