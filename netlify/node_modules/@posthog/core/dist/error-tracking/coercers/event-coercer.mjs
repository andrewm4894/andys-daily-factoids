import { isEvent } from "../../utils/index.mjs";
import { extractExceptionKeysForMessage } from "./utils.mjs";
class EventCoercer {
    match(err) {
        return isEvent(err);
    }
    coerce(evt, ctx) {
        var _ctx_syntheticException;
        const constructorName = evt.constructor.name;
        return {
            type: constructorName,
            value: `${constructorName} captured as exception with keys: ${extractExceptionKeysForMessage(evt)}`,
            stack: null == (_ctx_syntheticException = ctx.syntheticException) ? void 0 : _ctx_syntheticException.stack,
            synthetic: true
        };
    }
}
export { EventCoercer };
