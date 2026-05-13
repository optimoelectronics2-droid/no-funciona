# Despliegue

## Netlify

Netlify debe usar:

- Build command: `npm run build`
- Publish directory: `dist`
- Node: `20`

El archivo `netlify.toml` ya contiene esta configuracion.

Si Netlify falla durante la instalacion por versiones inexistentes, verifica que esten subidos `package.json`, `package-lock.json` y `.npmrc`. Este proyecto fuerza `protobufjs` a `7.5.8` y `@types/node` a `20.19.41` con `overrides`.

## GitHub Pages

Para GitHub Pages se usa:

```bash
npm run build:github
```

Ese build genera rutas con base `/sistema-de-facturacion/`.

El workflow `.github/workflows/deploy-github-pages.yml` publica automaticamente cuando haces push a `main`.

En GitHub configura:

1. Repository Settings.
2. Pages.
3. Source: GitHub Actions.

## Firebase Auth

Agrega tus dominios publicados en Firebase Authentication:

- `trifusiontechnologies1936-ctrl.github.io`
- tu dominio de Netlify, por ejemplo `tu-sitio.netlify.app`

Ruta:

`Firebase Console > Authentication > Settings > Authorized domains`
