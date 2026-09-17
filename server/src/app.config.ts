import { defineServer, defineRoom } from "colyseus";
import { MyRoom } from "./rooms/MyRoom.js";

export default defineServer({
  rooms: { world: defineRoom(MyRoom) },
});
