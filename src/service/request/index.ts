import { BACKEND_ERROR_CODE, createFlatRequest, getServiceBaseURL } from "./shared";
import { RequestInstanceState } from "./type";

const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
const { baseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);

export const request = createFlatRequest<App.Service.Response, RequestInstanceState>(
    {
        baseURL,
    },
    {
        async onRequest(config) {
            return config;
        },
        isBackendSuccess(response) {
            // when the backend response code is "0000"(default), it means the request is success
            // to change this logic by yourself, you can modify the `VITE_SERVICE_SUCCESS_CODE` in `.env` file
            return String(response.data.code) === import.meta.env.VITE_SERVICE_SUCCESS_CODE;
        },
        async onBackendFail(response) {
            const responseCode = String(response.data.code);
            console.log('请求失败: ', responseCode);

            return null;
        },
        transformBackendResponse(response) {
            return response.data.data;
        },
        onError(error) {
            // when the request is fail, you can show error message

            let backendErrorCode = '';

            // get backend error message and code
            if (error.code === BACKEND_ERROR_CODE) {
                backendErrorCode = String(error.response?.data?.code || '');
            }

            // the error message is displayed in the modal
            const modalLogoutCodes = import.meta.env.VITE_SERVICE_MODAL_LOGOUT_CODES?.split(',') || [];
            if (modalLogoutCodes.includes(backendErrorCode)) {
                return;
            }

            // when the token is expired, refresh token and retry request, so no need to show error message
            const expiredTokenCodes = import.meta.env.VITE_SERVICE_EXPIRED_TOKEN_CODES?.split(',') || [];
            if (expiredTokenCodes.includes(backendErrorCode)) {
                return;
            }
        }
    }
);

