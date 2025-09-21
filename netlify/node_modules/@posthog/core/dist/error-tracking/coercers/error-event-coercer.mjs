import { isErrorEvent } from "../../utils/index.mjs";
class ErrorEventCoercer {
    match(err) {
        return isErrorEvent(err) && void 0 != err.error;
    }
    coerce(err, ctx) {
        const exceptionLike = ctx.apply(err.error);
        if (exceptionLike) return exceptionLike;
        var _ctx_syntheticException;
        return {
            type: 'ErrorEvent',
            value: err.message,
            stack: null == (_ctx_syntheticException = ctx.syntheticException) ? void 0 : _ctx_syntheticException.stack,
            synthetic: true
        };
    }
    constructor(){}
}
export { ErrorEventCoercer };
