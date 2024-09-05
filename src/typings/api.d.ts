declare namespace Api {
    namespace Auth {
        interface LoginVO {
            tokenName: string;
            tokenValue: string;
            isLogin: boolean;
            loginId: string;
            loginType: string;
            tokenTimeout: number;
            sessionTimeout: number;
            tokenSessionTimeout: number;
            tokenActiveTimeout: number;
            loginDevice: string;
            tag: string | null;
        }
    }
}