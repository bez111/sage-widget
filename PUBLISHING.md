# Publishing

`@ergoblockchain/sage-widget` is published through npm Trusted Publishing.
This avoids local `npm publish` OTP prompts and avoids long-lived npm tokens.
See the npm documentation: https://docs.npmjs.com/trusted-publishers/

## One-time npm setup

In the npm package settings for `@ergoblockchain/sage-widget`, add a trusted
publisher with these values:

- Publisher: `GitHub Actions`
- Repository owner: `bez111`
- Repository name: `sage-widget`
- Workflow filename: `publish.yml`
- Environment name: leave empty unless npm requires one

## Release flow

1. Make sure `package.json` has the intended version.
2. Push `main`.
3. Create and push the matching tag:

```bash
git tag v0.3.0
git push origin v0.3.0
```

The GitHub Actions workflow builds, typechecks, smokes, and publishes the
package to npm with OIDC provenance.
