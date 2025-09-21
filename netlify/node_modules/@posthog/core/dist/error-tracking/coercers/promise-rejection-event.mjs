import { isBuiltin, isPrimitive } from "../../utils/index.mjs";
class PromiseRejectionEventCoercer {
    match(err) {
        return isBuiltin(err, 'PromiseRejectionEvent');
    }
    coerce(err, ctx) {
        const reason = this.getUnhandledRejectionReason(err);
        if (!isPrimitive(reason)) return ctx.apply(reason);
        var _ctx_syntheticException;
        return {
            type: 'UnhandledRejection',
            value: `Non-Error promise rejection captured with value: ${String(reason)}`,
            stack: null == (_ctx_syntheticException = ctx.syntheticException) ? void 0 : _ctx_syntheticException.stack,
            synthetic: true
        };
    }
    getUnhandledRejectionReason(error) {
        if (isPrimitive(error)) return error;
        try {
            if ('reason' in error) return error.reason;
            if ('detail' in error && 'reason' in error.detail) return error.detail.reason;
        } catch (e) {}
        return error;
    }
}
export { PromiseRejectionEventCoercer };
