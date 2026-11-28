import { Router } from "express";
import { authMiddleware } from "../../../../middleware/auth";
import { registerCoreWorldRoutes } from "./worldCoreRoutes";
import { registerGenerationWorldRoutes } from "./worldGenerationRoutes";
import { registerLockedRoomRoutes } from "./lockedRoomRoutes";
import { registerStructureWorldRoutes } from "./worldStructureRoutes";
import { registerVisualizationWorldRoutes } from "./worldVisualizationRoutes";

const router = Router();

router.use(authMiddleware);

registerLockedRoomRoutes(router);
registerGenerationWorldRoutes(router);
registerCoreWorldRoutes(router);
registerStructureWorldRoutes(router);
registerVisualizationWorldRoutes(router);

export default router;
