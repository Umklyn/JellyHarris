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
    // On utilise Formspree pour envoyer les emails sans backend
    const res = await fetch("https://formspree.io/f/YOUR_FORM_ID", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ name, email, subject, message })
    });

    if (res.ok) {
      status.textContent = "Message sent — thank you!";
      status.className = "form-status success";
      form.reset();
    } else {
      throw new Error("Server error");
    }
  } catch {
    status.textContent = "Send error — try again or reach me by email.";
    status.className = "form-status error";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send message";
  }
});
