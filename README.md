# Basemodo app Template

A full App for [Basemodo](https://basemodo.com): Bun, Hono, Vite, React, Tailwind, shadcn/ui and SQLite, in one package that deploys with no configuration.

```sh
bun create basemodocom/app my-app
cd my-app
bun run dev        # the client with hot reload, the API behind it
basemodo deploy    # live at https://<name>.basemodo.app
```

`AGENTS.md` explains how it is built and how to extend it.

## The commit Basemodo serves

Basemodo starts new Apps from this Template (`basemodo deploy --template app`) and gives its files to agents (`basemodo files --template app`) at a commit Basemodo pins, not at the head of `main`: a push here reaches new Apps once the pull request that pins it is merged in Basemodo, which `.github/workflows/pin.yml` opens on every push. `basemodo files --template app` names the commit it serves on its first line (`The app Template (basemodocom/app at <commit>)`), and its `--json` as `template.commit`. In a clone of this repository, `git log -1 --format=%H` is the clone's. When the two differ, the code an App starts from is the pinned commit's, and `git checkout <commit>` shows it.
