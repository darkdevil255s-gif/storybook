import { handleAuth } from '../server/auth-handler.js';

export default {
    fetch(request) {
        return handleAuth(request);
    }
};
