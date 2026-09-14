# Frontend deployment to AWS

The executable deployment entry point is `python3 scripts/deploy-aws.py`. It builds this repository's React application, pushes its Nginx image to a private ECR repository, and creates or updates an App Runner **frontend** service. It does not deploy Java, modify backend APIs, connect to RDS, or create a database.

The script defaults to an offline plan. `--check` performs read-only AWS preflight requests. Only `--apply` creates resources, pushes an image or updates a service. No AWS deployment is established merely by these files existing or by frontend tests passing.

AWS has closed App Runner to new customers. Existing App Runner customers can continue creating services. Confirm that the intended AWS account already has access before creating resources. A successful STS call or empty service list does not establish eligibility. If the account is ineligible, stop and choose a supported hosting target with the project owner; this script does not silently switch providers. See [AWS's availability notice](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html).

## Required configuration

Use Python 3.10+, AWS CLI v2, and a running Docker engine. Select the actual AWS account, region and frontend resources explicitly. No account IDs, credentials or backend endpoints are stored in this repository.

| CLI setting         | Meaning                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `--account-id`      | Expected 12-digit account ID, checked against STS.                                            |
| `--region`          | Explicit commercial AWS region supporting App Runner.                                         |
| `--profile`         | Optional local AWS CLI profile. Omit in GitHub Actions to use its assumed role.               |
| `--service-name`    | Exact frontend service name.                                                                  |
| `--repository`      | Dedicated private ECR repository name, using immutable tags.                                  |
| `--image-tag`       | New unique release tag, typically a commit SHA.                                               |
| `--backend-origin`  | Required HTTPS origin of the existing Spring Boot service, without a path or credentials.     |
| `--service-arn`     | Exact existing frontend ARN. Mutually exclusive with `--create-service`.                      |
| `--create-service`  | Explicitly create a new frontend service. Requires `--bootstrap-stack`.                       |
| `--bootstrap-stack` | Explicit CloudFormation stack name for a new frontend's ECR repository and image access role. |
| `--logout-path`     | Existing backend logout route, default `/logout`. This is baked into a newly built image.     |
| `--reuse-image`     | Reuse the selected existing immutable tag, without rebuilding or pushing it.                  |

`BACKEND_ORIGIN` is applied at container startup. Browser requests stay at `/api`; Nginx removes that prefix and forwards session cookies to the unchanged backend. Deployment builds always set `VITE_DEMO_MODE=false`. An image reused with `--reuse-image` retains its original API, demo-mode and logout settings. Only reuse an artifact previously verified as this production frontend; immutable tags prevent replacement but do not prove its contents.

The backend must be reachable from the frontend service. New services use public outbound networking. An existing service keeps its VPC connector, networking, instance size, scaling, health and observability settings. A private backend needs an already configured compatible network path; the script does not create VPC networking. See [App Runner VPC access](https://docs.aws.amazon.com/apprunner/latest/dg/network-vpc.html).

## Update an existing frontend

Before adoption, an administrator must verify the actual frontend service and add the tag `quickbite:component=frontend`. The script requires this tag and checks the ARN's account, region and name, the current ECR repository, port and start command. It rejects unmarked services, other repositories, code-based services, a backend origin pointing at the frontend itself, and conflicting secret-backed `BACKEND_ORIGIN` settings. These checks reduce the risk of updating a Java backend by mistake. Do not tag a backend as a frontend to bypass them.

Set the following shell variables to confirmed values, then preview the exact target:

```sh
python3 scripts/deploy-aws.py --plan \
  --account-id "$DEPLOY_ACCOUNT_ID" \
  --region "$DEPLOY_REGION" \
  --profile "$DEPLOY_PROFILE" \
  --service-name "$FRONTEND_SERVICE_NAME" \
  --service-arn "$FRONTEND_SERVICE_ARN" \
  --repository "$FRONTEND_ECR_REPOSITORY" \
  --image-tag "$FRONTEND_RELEASE_TAG" \
  --backend-origin "$EXISTING_BACKEND_ORIGIN"
```

Run the same command with `--check` for read-only verification, then `--apply` when deploying the reviewed target. An `AccessDenied` response means the identity lacks the needed permission; it does not mean the resource is absent. The script does not inspect credential files or print existing runtime variables or secret references.

For an existing service, only the source image and `BACKEND_ORIGIN` are changed. The existing image access role, other runtime variables, secret references and automatic deployment setting are copied without being logged. Other service settings are omitted from `UpdateService` so they remain intact. The script rechecks the service revision after building and stops if another update intervened. See [App Runner UpdateService](https://docs.aws.amazon.com/apprunner/latest/api/API_UpdateService.html).

## Create a new frontend

Use the same required configuration, replace `--service-arn` with these two arguments, and first run `--plan` and `--check`:

```sh
--create-service --bootstrap-stack "$FRONTEND_BOOTSTRAP_STACK"
```

An apply run performs these steps:

1. Create the selected bootstrap stack from `infra/aws/bootstrap.json`, containing a dedicated immutable ECR repository and a narrowly scoped App Runner image access role. An existing matching bootstrap stack is reused. An unrelated existing repository or stack is rejected.
2. Build a Linux AMD64 image, authenticate Docker to ECR using a temporary token, and push the selected release tag. The Docker login uses an isolated temporary configuration directory.
3. Create an App Runner image service on port `8080`, using HTTP `/health` checks and the required backend origin. New services use 0.25 vCPU and 0.5 GB memory, with automatic image deployment disabled. AWS resources incur their normal charges.
4. Wait for the returned operation ID to succeed, verify the service is `RUNNING`, and check its public `/health` endpoint. The script prints the resulting URL and ARN only after those checks pass.

The ECR repository is retained if the bootstrap stack is deleted, so deleting a stack does not erase release images. The App Runner service is created by the deployment script, outside that bootstrap stack. The script never automatically deletes a failed stack or service. Inspect AWS events and logs before retrying. A timeout also requires checking the existing operation before another run.

The image access role trusts `build.apprunner.amazonaws.com` and grants authorization-token access plus pull permissions for this repository. It is distinct from the deployment identity and from an application instance role. The static frontend needs no RDS credentials or application instance role. See [App Runner IAM roles](https://docs.aws.amazon.com/apprunner/latest/dg/security_iam_service-with-iam.html) and [ECR image pushing](https://docs.aws.amazon.com/AmazonECR/latest/userguide/docker-push-ecr-image.html).

## GitHub Actions with OIDC

The manual **Deploy frontend to AWS** workflow uses the same script and defaults to `check`. It runs only on the repository's default branch and serializes deployments. Its `apply` option is an explicit deployment action.

Configure an AWS IAM OIDC deployment role for this repository. Restrict its trust policy to `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`, and the exact default-branch subject emitted by this repository. The traditional format is `repo:OWNER/REPOSITORY:ref:refs/heads/BRANCH`. Repositories created after July 15, 2026, or opted into immutable subject claims use owner and repository IDs, such as `repo:OWNER@OWNER_ID/REPOSITORY@REPO_ID:ref:refs/heads/BRANCH`. Match the actual subject format; do not use a wildcard repository or allow pull-request subjects. The workflow needs `id-token: write` and `contents: read`; it uses temporary AWS credentials instead of stored access keys. See [GitHub's current AWS OIDC configuration](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws) and [AWS's OIDC guidance](https://aws.amazon.com/blogs/security/use-iam-roles-to-connect-github-actions-to-actions-in-aws/).

Set these repository **variables**:

- `AWS_ACCOUNT_ID`, `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`
- `ECR_REPOSITORY`, `APP_RUNNER_SERVICE_NAME`, `BACKEND_ORIGIN`
- `APP_RUNNER_SERVICE_ARN` for existing services, or `AWS_BOOTSTRAP_STACK` for creation
- Optional `VITE_LOGOUT_PATH` for an already customized backend logout route

The deployment role needs read permissions for the selected service, its tags and operations, ECR repository/images, and the bootstrap stack when creating. Apply also needs ECR push actions and `ecr:GetAuthorizationToken`; App Runner create/update actions and `iam:PassRole` restricted to the selected image access role. New bootstrap creation additionally requires CloudFormation stack creation and the IAM/ECR actions declared in its template. The first App Runner service may need `iam:CreateServiceLinkedRole` restricted to App Runner. An AWS administrator should scope these permissions to the confirmed account's frontend resources. The supplied image-pull role alone cannot deploy the application.

Choose `existing` or `create`, a release tag, and `check` or `apply`. An empty tag uses the workflow commit SHA. If that tag already exists, select **reuse_image** to deploy the existing artifact, or use a new tag to build different code or settings.

## Verification and rollback

Run the offline deployment tests with:

```sh
python3 scripts/deploy-aws.test.py
```

The tests cover configuration validation, rejecting the wrong service, preserving runtime configuration and secret references, read-only modes, and deployment failure/success reporting. They do not contact AWS.

After a real deployment, verify the live registration, login, refresh/session restoration, menu browsing, cart, checkout, logout and account-switching flows. `/health` checks only frontend liveness and cannot establish backend integration. Avoid placing real orders during unauthorised production testing.

To roll back frontend code, use the verified service ARN, the desired previous image tag and `--reuse-image --apply`. Supply the backend origin appropriate for that release. Runtime configuration is preserved except for the explicit backend origin. Retain the previous image tag and service ARN in release records so rollback does not depend on a mutable `latest` tag.
