import type { Handler, PagesContext } from "../../types";
import { forward } from "../../lib/bridge";

export const onRequestPost: Handler = (context: PagesContext) => forward(context, context.request);
