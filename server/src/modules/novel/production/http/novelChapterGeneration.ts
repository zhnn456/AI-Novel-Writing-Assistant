import type { Router } from "express";
import { z } from "zod";
import { streamToSSE } from "../../../../llm/streaming";
import { validate } from "../../../../middleware/validate";
import type { ChapterRuntimeCoordinator } from "../../../../services/novel/runtime/ChapterRuntimeCoordinator";
import { chapterRuntimeRequestSchema } from "../../../../services/novel/runtime/chapterRuntimeSchema";
import { stepModuleRunner } from "../../../../services/novel/director/workflowStepRuntime/StepModuleRunner";
import { DIRECTOR_EXECUTION_STEP_IDS } from "../../../../services/novel/director/workflowStepRuntime/directorWorkflowStepIds";
import { beginChapterGeneration } from "../../../../modules/license/entitlement";

type ChapterStreamResult = Awaited<ReturnType<ChapterRuntimeCoordinator["createChapterStream"]>>;

interface RegisterNovelChapterGenerationRoutesInput {
  router: Router;
  chapterParamsSchema: z.ZodType<{
    id: string;
    chapterId: string;
  }>;
  forwardBusinessError: (error: unknown, next: (err?: unknown) => void) => boolean;
}

export function registerNovelChapterGenerationRoutes(input: RegisterNovelChapterGenerationRoutesInput): void {
  const {
    router,
    chapterParamsSchema,
    forwardBusinessError,
  } = input;

  router.post(
    "/:id/chapters/:chapterId/runtime/run",
    validate({ params: chapterParamsSchema, body: chapterRuntimeRequestSchema }),
    async (req, res, next) => {
      // 授权校验：受限模式（未激活/到期/吊销）下每本书只放行 3 章。
      let ticket: Awaited<ReturnType<typeof beginChapterGeneration>> | null = null;
      try {
        ticket = await beginChapterGeneration((req.params as { id: string }).id);
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const { stream, onDone } = await stepModuleRunner.runStep<ChapterStreamResult>(
          DIRECTOR_EXECUTION_STEP_IDS.chapter_execution,
          {
            novelId: id,
            mode: "manual",
            targetType: "chapter",
            targetChapterId: chapterId,
            stepInput: {
              options: req.body as z.infer<typeof chapterRuntimeRequestSchema>,
              runtimeStream: true,
            },
          },
        );
        await streamToSSE(res, stream, onDone);
        // 章节真正产出后才记 1 章，并上报给 Keygate 作为服务端权威账本。
        ticket?.commit();
      } catch (error) {
        // 失败/中断不记账（commit 没被调用），用户不会白扣额度。
        ticket?.refund();
        if (forwardBusinessError(error, next)) {
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/generate",
    validate({ params: chapterParamsSchema, body: chapterRuntimeRequestSchema }),
    async (req, res, next) => {
      // 授权校验：受限模式（未激活/到期/吊销）下每本书只放行 3 章。
      let ticket: Awaited<ReturnType<typeof beginChapterGeneration>> | null = null;
      try {
        ticket = await beginChapterGeneration((req.params as { id: string }).id);
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const { stream, onDone } = await stepModuleRunner.runStep<ChapterStreamResult>(
          DIRECTOR_EXECUTION_STEP_IDS.chapter_execution,
          {
            novelId: id,
            mode: "manual",
            targetType: "chapter",
            targetChapterId: chapterId,
            stepInput: req.body as z.infer<typeof chapterRuntimeRequestSchema>,
          },
        );
        await streamToSSE(res, stream, onDone);
        // 章节真正产出后才记 1 章，并上报给 Keygate 作为服务端权威账本。
        ticket?.commit();
      } catch (error) {
        // 失败/中断不记账（commit 没被调用），用户不会白扣额度。
        ticket?.refund();
        if (forwardBusinessError(error, next)) {
          return;
        }
        next(error);
      }
    },
  );
}
