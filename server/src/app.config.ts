import { defineServer, defineRoom } from "colyseus";
import express from "express";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { MyRoom } from "./rooms/MyRoom.js";

export default defineServer({
  rooms: { world: defineRoom(MyRoom) },
  express: (app) => {
    app.get("/healthz", (_request, response) => response.json({ ok: true }));
    const directory = process.env.CLIENT_DIST_PATH;
    if (directory) {
      const root = resolve(directory);
      if (!existsSync(join(root, "index.html"))) throw new Error("게임 화면의 빌드 파일이 없습니다.");
      // Serve only compiled client assets; source files and the SQLite directory stay private.
      app.use(express.static(root, { dotfiles: "deny", etag: true, maxAge: 0 }));
    }
  },
});
