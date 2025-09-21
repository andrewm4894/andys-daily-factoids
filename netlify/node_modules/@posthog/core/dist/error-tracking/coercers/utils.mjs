function truncate(str) {
    let max = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 0;
    if ('string' != typeof str || 0 === max) return str;
    return str.length <= max ? str : `${str.slice(0, max)}...`;
}
function extractExceptionKeysForMessage(err) {
    let maxLength = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 40;
    const keys = Object.keys(err);
    keys.sort();
    if (!keys.length) return '[object has no keys]';
    for(let i = keys.length; i > 0; i--){
        const serialized = keys.slice(0, i).join(', ');
        if (!(serialized.length > maxLength)) {
            if (i === keys.length) return serialized;
            return serialized.length <= maxLength ? serialized : `${serialized.slice(0, maxLength)}...`;
        }
    }
    return '';
}
export { extractExceptionKeysForMessage, truncate };
