import { serverOrigin } from "./origin";

export const mobileScheme = "substrate-mobile";
export const mobileOrigin = `${mobileScheme}://`;
export const apiURL = serverOrigin(process.env.EXPO_PUBLIC_API_URL);
