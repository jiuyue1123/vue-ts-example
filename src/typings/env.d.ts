/**
 * Namespace Env
 *
 * It is used to declare the type of the import.meta object
 */
declare namespace Env {
    /** The router history mode */
    type RouterHistoryMode = 'hash' | 'history' | 'memory';

    /** Interface for import.meta */
    interface ImportMeta extends ImportMetaEnv {
        /** The base url of the application */
        readonly VITE_BASE_URL: string;
        /**
         * success code of backend service
         *
         * when the code is received, the request is successful
         */
        readonly VITE_SERVICE_SUCCESS_CODE: string;
        /**
         * Whether to enable the http proxy
         *
         * Only valid in the development environment
         */
        readonly VITE_HTTP_PROXY?: 'Y' | 'N';
    }
}

interface ImportMeta {
    readonly env: Env.ImportMeta;
}
