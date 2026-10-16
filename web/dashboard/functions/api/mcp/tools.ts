import type { Handler, PagesContext } from "../../types";
import { forward } from "../../lib/bridge";

export const onRequestGet: Handler = (context: PagesContext) => forward(context, context.request);
