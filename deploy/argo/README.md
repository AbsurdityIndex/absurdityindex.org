# Argo Deployment Manifests

This folder stores the Kubernetes/Argo fallback deployment pipeline for `absurdityindex.org` + `votechain`.

Primary CI/CD now runs in GitHub Actions (`.github/workflows/`), but these manifests remain as an infrastructure backup.

The live fallback CronJob is intentionally suspended when GitHub Actions is the active deploy system:

```bash
kubectl -n argo patch cronjob absurdity-index-poller -p '{"spec":{"suspend":true}}'
```

## Resources

- `absurdity-index-poller.cronjob.yaml`
  - Polls `AbsurdityIndex/absurdityindex.org` and `AbsurdityIndex/votechain` every minute
  - Submits a workflow when either repo's `main` SHA changes
- `deploy-absurdity-index.workflowtemplate.yaml`
  - Executes coordinated test then production deploy for both projects
- `kustomization.yaml`
  - Applies both resources into the `argo` namespace

## Apply

```bash
kubectl apply -k deploy/argo
```

## Required Kubernetes resources (namespace: `argo`)

- Secret `github-pat`
  - key `token` = PAT with read access to both repos
- Secret `cloudflare-api-token`
  - key `token` = Cloudflare API token with Pages deploy permissions
- ServiceAccount `argo-events-sa`
- ServiceAccount `argo-workflow-deployer`

## Verify

```bash
kubectl -n argo get cronjob absurdity-index-poller
kubectl -n argo get workflowtemplate deploy-absurdity-index
kubectl -n argo get configmap absurdity-index-poller-state -o yaml
kubectl -n argo get workflows.argoproj.io --sort-by=.metadata.creationTimestamp | tail -n 5
```
