import { db } from "./firebase-init.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const form = document.getElementById("contact-form");
const status = document.getElementById("form-status");
const submitBtn = document.getElementById("submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const subject = document.getElementById("subject").value.trim();
  const message = document.getElementById("message").value.trim();

  submitBtn.disabled = true;
  submitBtn.textContent = "Sending...";
  status.textContent = "";
  status.className = "form-status";

  try {
    await addDoc(collection(db, "messages"), {
      name, email, subject, message,
      read: false,
      createdAt: serverTimestamp()
    });

    status.textContent = "Message sent — thank you!";
    status.className = "form-status success";
    form.reset();
  } catch {
    status.textContent = "Send error — try again or reach me by email.";
    status.className = "form-status error";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send message";
  }
});
