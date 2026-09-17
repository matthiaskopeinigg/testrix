# Releasing

Version lives in the root `package.json` and workspace package manifests (`2.0.0-beta.1` for this milestone).

```bash
npm run build
npm run electron:pack
```

Windows Setup.exe is a portable Electron shell with an appended `payload.zip` and `TESTRIXPK` footer. GitHub Releases remain the intended publish channel.
