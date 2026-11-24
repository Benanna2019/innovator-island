import { WorkflowManager } from "@convex-dev/workflow"
import { v } from "convex/values"
import { components, internal } from "./_generated/api"

export const workflow = new WorkflowManager(components.workflow)

/**
 * chromaKey, then composite, then finalize. Each step is retryable and visible in the workflow history, in place
 * of upstream's implicit chain of S3 bucket triggers. A step that fails (no green screen, say) fails the workflow,
 * and `photos.onWorkflowComplete` marks the photo failed.
 */
export const processPhoto = workflow.define({
  args: { photoId: v.id("photos") },
  handler: async (step, { photoId }): Promise<void> => {
    const keyedId = await step.runAction(internal.photoSteps.chromaKey, { photoId })
    const composedId = await step.runAction(internal.photoSteps.composite, { photoId, keyedId })
    await step.runAction(internal.photoSteps.finalize, { photoId, composedId })
  },
})
