import { isPrimitive } from "../../utils/index.mjs";
class PrimitiveCoercer {
    match(candidate) {
        return isPrimitive(candidate);
    }
    coerce(value, ctx) {
        var _ctx_syntheticException;
        return {
            type: 'Error',
            value: `Primitive value captured as exception: ${String(value)}`,
            stack: null == (_ctx_syntheticException = ctx.syntheticException) ? void 0 : _ctx_syntheticException.stack,
            synthetic: true
        };
    }
}
export { PrimitiveCoercer };
