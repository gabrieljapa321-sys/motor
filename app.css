  (function () {
    function waitForSyncService() {
      if (!window.StudySync) {
        setTimeout(waitForSyncService, 300);
        return;
      }

      const panel = document.getElementById("authInlinePanel");
      const toggleButton = document.getElementById("tbAuthBtn");
      const toggleLabel = document.getElementById("tbAuthLabel");
      const closeBtn = document.getElementById("authCloseBtn");
      const titleEl = document.getElementById("authPanelTitle");
      const statusEl = document.getElementById("authStatus");
      const syncEl = document.getElementById("authSyncStatus");
      const buttonsEl = document.getElementById("authButtons");
      const loginBtn = document.getElementById("btnGoogleLogin");
      const logoutBtn = document.getElementById("btnGoogleLogout");

      function setToggleLabel(text) {
        if (toggleLabel) toggleLabel.textContent = text;
      }

      function setPanelOpen(isOpen) {
        if (!panel) return;
        if (isOpen) {
          panel.removeAttribute("hidden");
        } else {
          panel.setAttribute("hidden", "");
          const user = window.StudySync.getCurrentUser();
          setToggleLabel(user ? "Conta · " + ((user.displayName || "Usuário").split(" ")[0]) : "Conta");
        }
        if (toggleButton) toggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
      }

      if (toggleButton) {
        toggleButton.addEventListener("click", function () {
          const isHidden = panel.hasAttribute("hidden");
          setPanelOpen(isHidden);
        });
      }

      if (closeBtn) {
        closeBtn.addEventListener("click", function () {
          setPanelOpen(false);
        });
      }

      window.StudySync.subscribeStatus(function ({ text, tone }) {
        if (!syncEl) return;
        syncEl.textContent = text;
        syncEl.style.color = tone === "danger"
          ? "#b42318"
          : tone === "success"
            ? "#117a4d"
            : tone === "accent"
              ? "#2f5bea"
              : "var(--muted)";
      });

      loginBtn.addEventListener("click", async function () {
        try {
          await window.StudySync.login();
        } catch (err) {
          alert("Erro no login com Google.\nCódigo: " + (err.code || "sem código") + "\nMensagem: " + (err.message || "sem mensagem"));
          setPanelOpen(true);
        }
      });

      logoutBtn.addEventListener("click", async function () {
        try {
          await window.StudySync.logout();
        } catch (err) {
          console.error("Erro ao sair:", err);
          alert("Erro ao sair.\nCódigo: " + (err.code || "sem código") + "\nMensagem: " + (err.message || "sem mensagem"));
        }
      });

      window.StudySync.subscribeAuth(function (user) {
        if (user) {
          const nomeCompleto = user.displayName || "Usuário";
          const primeiroNome = nomeCompleto.split(" ")[0];
          if (titleEl) titleEl.textContent = "Conta conectada";
          statusEl.innerHTML = "<strong>" + primeiroNome + "</strong><br><span style=\"color:var(--muted);\">" + (user.email || "") + "</span>";
          loginBtn.style.display = "none";
          logoutBtn.style.display = "inline-block";
          if (toggleButton) toggleButton.setAttribute("data-state", "connected");
          setToggleLabel("Conta · " + primeiroNome);
        } else {
          if (titleEl) titleEl.textContent = "Conta e sincronização";
          statusEl.innerHTML = "<strong>Não logado</strong><br><span style=\"color:var(--muted);\">Entre com Google para sincronizar seus dados.</span>";
          loginBtn.style.display = "inline-block";
          logoutBtn.style.display = "none";
          if (toggleButton) toggleButton.setAttribute("data-state", "idle");
          setToggleLabel("Conta");
        }
      });

      setPanelOpen(false);
    }

    waitForSyncService();
  })();
