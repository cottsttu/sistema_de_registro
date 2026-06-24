async function iniciarLogin() {
    document.querySelectorAll(".password-toggle").forEach((button) => {
        button.addEventListener("click", () => {
            const input = document.getElementById(button.dataset.target);
            const shouldShow = input.type === "password";
            input.type = shouldShow ? "text" : "password";
            button.setAttribute("aria-label", shouldShow ? "Ocultar senha" : "Mostrar senha");
        });
    });

    document.getElementById("linkIrCadastro").onclick = () => {
        document.getElementById("telaLogin").classList.add("hidden");
        document.getElementById("telaCadastro").classList.remove("hidden");
        limparErros();
    };

    document.getElementById("linkIrLogin").onclick = () => {
        document.getElementById("telaCadastro").classList.add("hidden");
        document.getElementById("telaLogin").classList.remove("hidden");
        limparErros();
    };

    function limparErros() {
        document.getElementById("msgErroLogin").style.display = "none";
        document.getElementById("msgErroCad").style.display = "none";
    }

    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");
    const { getFirestore, doc, setDoc, getDoc, updateDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");

    const firebaseConfig = {
        apiKey: "AIzaSyCjiEzdahcQqKS9V1Py4nAIx15Zqr9nIIo",
        authDomain: "sttu-registros.firebaseapp.com",
        projectId: "sttu-registros",
        storageBucket: "sttu-registros.firebasestorage.app",
        messagingSenderId: "785219239564",
        appId: "1:785219239564:web:4b8175a8d7ccceba06c5a9",
        measurementId: "G-C7PSE7YFRG"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    function normalizarValor(valor) {
        return String(valor || "").trim().toLowerCase();
    }

    function obterStatusUsuario(dadosUsuario) {
        if (!dadosUsuario) return "desativado";

        const status = normalizarValor(dadosUsuario.status);
        const aprovado = normalizarValor(dadosUsuario.aprovado);

        if (dadosUsuario.ativo === true) return "ativo";
        if (status === "desativado") return "desativado";
        if (status === "pendente") return "pendente";
        if (status === "ativo" || status === "aprovado") return "ativo";
        if (dadosUsuario.aprovado === true || aprovado === "true" || aprovado === "aprovado") return "ativo";

        return "pendente";
    }

    document.getElementById("btnEntrar").onclick = () => {
        const entrada = document.getElementById("loginUser").value.trim();
        const senha = document.getElementById("loginPass").value;
        const msg = document.getElementById("msgErroLogin");
        const botaoEntrar = document.getElementById("btnEntrar");

        msg.style.display = "none";

        if (!entrada || !senha) {
            msg.innerText = "Preencha usuário e senha.";
            msg.style.display = "block";
            return;
        }

        const emailFinal = entrada.includes("@") ? entrada : entrada + "@sttu.com";
        botaoEntrar.disabled = true;

        signInWithEmailAndPassword(auth, emailFinal, senha)
            .then(async (userCredential) => {
                const userDoc = await getDoc(doc(db, "usuarios", userCredential.user.uid));
                const dadosUsuario = userDoc.exists() ? userDoc.data() : null;
                const statusUsuario = obterStatusUsuario(dadosUsuario);

                if (statusUsuario !== "ativo") {
                    await signOut(auth);
                    msg.innerText = statusUsuario === "pendente"
                        ? "Cadastro pendente para aprovação."
                        : "Usuário não autorizado.";
                    msg.style.display = "block";
                    botaoEntrar.disabled = false;
                    return;
                }

                await updateDoc(doc(db, "usuarios", userCredential.user.uid), {
                    online: true,
                    ultimoAcesso: serverTimestamp()
                }).catch((error) => console.warn("Não foi possível atualizar presença:", error));
                window.location.href = "index.html";
            })
            .catch((error) => {
                botaoEntrar.disabled = false;
                msg.style.display = "block";
                if (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
                    msg.innerText = "Dados incorretos.";
                } else {
                    msg.innerText = "Erro: " + error.code;
                }
            });
    };

    document.getElementById("btnCadastrar").onclick = async () => {
        const nome = document.getElementById("cadNome").value.trim().toUpperCase();
        const matricula = document.getElementById("cadMatricula").value.trim();
        const senha = document.getElementById("cadSenha").value;
        const msg = document.getElementById("msgErroCad");

        msg.style.display = "none";

        if (!nome || !matricula || !senha) {
            msg.innerText = "Preencha todos os campos.";
            msg.style.display = "block";
            return;
        }

        if (senha.length < 6) {
            msg.innerText = "Senha muito curta (mínimo 6).";
            msg.style.display = "block";
            return;
        }

        const emailFake = matricula + "@sttu.com";

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, emailFake, senha);
            const user = userCredential.user;

            await setDoc(doc(db, "usuarios", user.uid), {
                nome: nome,
                matricula: matricula,
                cargo: "agente",
                nivel_acesso: "total",
                status: "pendente",
                ativo: false,
                aprovado: false,
                online: false
            });

            await signOut(auth);
            alert("Solicitação enviada!\n\nAguarde a aprovação do administrador para acessar.");
            document.getElementById("linkIrLogin").click();
        } catch (error) {
            console.error(error);
            msg.style.display = "block";
            if (error.code === "auth/email-already-in-use") {
                msg.innerText = "Usuário já cadastrado.";
            } else {
                msg.innerText = "Erro: " + error.message;
            }
        }
    };

    document.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
            if (!document.getElementById("telaLogin").classList.contains("hidden")) {
                document.getElementById("btnEntrar").click();
            } else {
                document.getElementById("btnCadastrar").click();
            }
        }
    });
}

iniciarLogin().catch((error) => {
    console.error("Erro ao carregar o login:", error);
    const msg = document.getElementById("msgErroLogin");
    if (msg) {
        msg.innerText = "Erro ao carregar o login. Verifique a conexão e atualize a página.";
        msg.style.display = "block";
    }
});
