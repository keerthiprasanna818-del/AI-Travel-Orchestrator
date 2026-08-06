import { createServerFn } from "@tanstack/react-start";

export const generateTravelPlan = createServerFn({ method: "POST" })
  .inputValidator((input: { travelPlanId: string }) => {
    if (!input?.travelPlanId) throw new Error("travelPlanId is required");
    return { travelPlanId: input.travelPlanId };
  })
  .handler(async ({ data }) => {
    const { generatePlanForRow } = await import("./travel-plan.server");
    return generatePlanForRow(data.travelPlanId);
  });
