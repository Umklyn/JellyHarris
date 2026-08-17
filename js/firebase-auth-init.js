import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { app } from "./firebase-init.js";

export const auth = getAuth(app);
