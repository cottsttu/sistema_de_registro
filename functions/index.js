const admin = require("firebase-admin");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onRequest} = require("firebase-functions/v2/https");

admin.initializeApp();

function normalizarMatricula(valor) {
  return String(valor || "").trim();
}

async function atualizarCredenciais(data, authUid) {
  if (!authUid) {
    return {ok: false, message: "Faça login para continuar."};
  }

  const callerSnap = await admin.firestore().doc(`usuarios/${authUid}`).get();
  if (!callerSnap.exists || callerSnap.data().cargo !== "admin") {
    return {ok: false, message: "Acesso restrito a administradores."};
  }

  const {uid, nome, matricula, cargo, senha} = data || {};
  const uidSolicitado = String(uid || "").trim();
  const matriculaFinal = normalizarMatricula(matricula);

  console.log("Solicitação de atualização de usuário", {
    solicitante: authUid,
    uid: uidSolicitado,
    matricula: matriculaFinal,
    cargo,
    alteraSenha: Boolean(senha)
  });

  if (!nome || !matriculaFinal || !cargo) {
    return {ok: false, message: "Dados obrigatórios ausentes."};
  }

  if (senha && String(senha).length < 6) {
    return {ok: false, message: "A senha deve ter no mínimo 6 caracteres."};
  }

  if (!uidSolicitado && !senha) {
    return {ok: false, message: "Informe uma senha inicial para criar o novo usuario."};
  }

  const authUpdate = {
    email: `${matriculaFinal}@sttu.com`
  };

  if (senha) {
    authUpdate.password = String(senha);
  }

  try {
    const usuarioComMesmoLogin = await admin.auth().getUserByEmail(authUpdate.email)
      .catch((error) => {
        if (error.code === "auth/user-not-found") return null;
        throw error;
      });

    if (usuarioComMesmoLogin && usuarioComMesmoLogin.uid !== uidSolicitado) {
      const usuarioBancoComMesmoLogin = await admin.firestore()
        .collection("usuarios")
        .where("matricula", "==", matriculaFinal)
        .limit(1)
        .get();

      if (!usuarioBancoComMesmoLogin.empty) {
        const docMesmoLogin = usuarioBancoComMesmoLogin.docs[0];
        if (docMesmoLogin.id !== uidSolicitado) {
          return {ok: false, message: "Essa matrícula/login já está sendo usada por outro usuário."};
        }
      }

      console.warn("Removendo usuário órfão do Authentication para liberar login", {
        uidOrfao: usuarioComMesmoLogin.uid,
        matricula: matriculaFinal,
        uidDestino: uidSolicitado || "novo_usuario"
      });
      await admin.auth().deleteUser(usuarioComMesmoLogin.uid);
    }

    let uidFinal = uidSolicitado;

    try {
      if (uidFinal) {
        await admin.auth().updateUser(uidFinal, authUpdate);
      } else {
        const novoUsuario = await admin.auth().createUser({
          email: authUpdate.email,
          password: String(senha),
          emailVerified: true,
          disabled: false
        });
        uidFinal = novoUsuario.uid;
      }
    } catch (authError) {
      if (authError.code !== "auth/user-not-found") {
        throw authError;
      }

      if (!senha) {
        return {
          ok: false,
          message: "Esse usuário existe no banco, mas não existe no Firebase Authentication. Informe uma nova senha para recriar o login."
        };
      }

      await admin.auth().createUser({
        uid: uidFinal,
        email: authUpdate.email,
        password: String(senha),
        emailVerified: true,
        disabled: false
      });
    }

    const dadosUsuario = {
      nome: String(nome).trim().toUpperCase(),
      matricula: matriculaFinal,
      cargo
    };

    if (!uidSolicitado) {
      Object.assign(dadosUsuario, {
        nivel_acesso: "total",
        status: "aprovado",
        ativo: true,
        aprovado: true,
        online: false,
        criadoPeloAdmin: true,
        criadoEm: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    if (senha && !uidSolicitado) {
      Object.assign(dadosUsuario, {
        trocarSenhaNoPrimeiroAcesso: true,
        senhaInicialDefinidaEm: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    await admin.firestore().doc(`usuarios/${uidFinal}`).set(dadosUsuario, {merge: true});

    return {ok: true, uid: uidFinal};
  } catch (error) {
    console.error("Erro ao atualizar credenciais do usuário:", error);

    if (error.code === "auth/email-already-exists") {
      return {ok: false, message: "Essa matrícula/login já está sendo usada por outro usuário."};
    }

    if (error.code === "auth/user-not-found") {
      return {ok: false, message: "Usuário não encontrado no Firebase Authentication."};
    }

    if (error.code === "auth/invalid-email") {
      return {ok: false, message: "Matrícula inválida para login."};
    }

    if (error.code === "auth/invalid-password") {
      return {ok: false, message: "Senha inválida. Use pelo menos 6 caracteres."};
    }

    if (error.code === "auth/insufficient-permission") {
      return {
        ok: false,
        message: "A conta de serviço da Function não tem permissão para alterar usuários no Firebase Authentication. Adicione o papel Firebase Authentication Admin."
      };
    }

    return {
      ok: false,
      code: error.code || "unknown",
      message: error.message || "Não foi possível atualizar login/senha."
    };
  }
}

async function validarAdmin(authUid) {
  if (!authUid) {
    return {ok: false, message: "Faça login para continuar."};
  }

  const callerSnap = await admin.firestore().doc(`usuarios/${authUid}`).get();
  if (!callerSnap.exists || callerSnap.data().cargo !== "admin") {
    return {ok: false, message: "Acesso restrito a administradores."};
  }

  return {ok: true};
}

function gerarIdAgente(nome) {
  return String(nome || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || `agente_${Date.now()}`;
}

async function gerenciarAgenteCondutor(data, authUid) {
  const adminCheck = await validarAdmin(authUid);
  if (!adminCheck.ok) return adminCheck;

  const acao = String((data && data.acao) || "").trim();
  const nome = String((data && data.nome) || "").trim().toUpperCase();
  const idInformado = String((data && data.id) || "").trim();
  const docId = idInformado || gerarIdAgente(nome);

  if (acao === "salvar") {
    if (!nome) {
      return {ok: false, message: "Informe o nome do agente/condutor."};
    }

    await admin.firestore().doc(`agentes_condutores/${docId}`).set({
      nome,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      atualizadoPor: authUid
    }, {merge: true});

    return {ok: true, id: docId};
  }

  if (acao === "excluir") {
    if (!docId) {
      return {ok: false, message: "Agente/condutor não informado."};
    }

    await admin.firestore().doc(`agentes_condutores/${docId}`).delete();
    return {ok: true};
  }

  if (acao === "importar") {
    const agentes = Array.isArray(data && data.agentes) ? data.agentes : [];
    const nomes = [...new Set(agentes
        .map((item) => String(item || "").trim().toUpperCase())
        .filter(Boolean))];

    if (!nomes.length) {
      return {ok: false, message: "Lista de agentes vazia."};
    }

    const batch = admin.firestore().batch();
    nomes.forEach((nomeAgente) => {
      const ref = admin.firestore().doc(`agentes_condutores/${gerarIdAgente(nomeAgente)}`);
      batch.set(ref, {
        nome: nomeAgente,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        atualizadoPor: authUid
      }, {merge: true});
    });
    await batch.commit();

    return {ok: true, total: nomes.length};
  }

  return {ok: false, message: "Ação inválida."};
}

async function listarAgentesCondutores(authUid) {
  if (!authUid) {
    return {ok: false, message: "Faça login para continuar."};
  }

  const snapshot = await admin.firestore().collection("agentes_condutores").get();
  const agentes = [];

  snapshot.forEach((docSnap) => {
    const nome = String((docSnap.data() && docSnap.data().nome) || "").trim().toUpperCase();
    if (!nome) return;
    agentes.push({id: docSnap.id, nome});
  });

  agentes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return {ok: true, agentes};
}

async function excluirUsuarioAdmin(data, authUid) {
  const adminCheck = await validarAdmin(authUid);
  if (!adminCheck.ok) return adminCheck;

  const uid = String((data && data.uid) || "").trim();
  if (!uid) {
    return {ok: false, message: "Usuario nao informado."};
  }

  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    if (error.code !== "auth/user-not-found") {
      console.error("Erro ao excluir usuario do Authentication:", error);
      return {
        ok: false,
        code: error.code || "unknown",
        message: error.message || "Nao foi possivel excluir o usuario no Firebase Authentication."
      };
    }
  }

  await admin.firestore().doc(`usuarios/${uid}`).delete();
  return {ok: true};
}

exports.atualizarCredenciaisUsuario = onCall(async (request) => {
  const resultado = await atualizarCredenciais(request.data, request.auth && request.auth.uid);

  if (!resultado.ok) {
    throw new HttpsError("failed-precondition", resultado.message || "Não foi possível atualizar login/senha.", resultado);
  }

  return resultado;
});

exports.gerenciarAgenteCondutor = onCall(async (request) => {
  const resultado = await gerenciarAgenteCondutor(request.data, request.auth && request.auth.uid);

  if (!resultado.ok) {
    throw new HttpsError("failed-precondition", resultado.message || "Nao foi possivel gerenciar agente/condutor.", resultado);
  }

  return resultado;
});

exports.listarAgentesCondutores = onCall(async (request) => {
  const resultado = await listarAgentesCondutores(request.auth && request.auth.uid);

  if (!resultado.ok) {
    throw new HttpsError("failed-precondition", resultado.message || "Nao foi possivel listar agentes/condutores.", resultado);
  }

  return resultado;
});

exports.excluirUsuarioAdmin = onCall(async (request) => {
  const resultado = await excluirUsuarioAdmin(request.data, request.auth && request.auth.uid);

  if (!resultado.ok) {
    throw new HttpsError("failed-precondition", resultado.message || "Nao foi possivel excluir o usuario.", resultado);
  }

  return resultado;
});

exports.atualizarCredenciaisUsuarioHttp = onRequest({cors: true}, async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ok: false, message: "Método não permitido."});
      return;
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      res.status(401).json({ok: false, message: "Token de autenticação ausente."});
      return;
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const resultado = await atualizarCredenciais(req.body, decoded.uid);
    res.status(resultado.ok ? 200 : 400).json(resultado);
  } catch (error) {
    console.error("Erro na rota HTTP de atualização de credenciais:", error);
    res.status(500).json({
      ok: false,
      message: error.message || "Erro interno ao atualizar login/senha."
    });
  }
});

exports.gerenciarAgenteCondutorHttp = onRequest({cors: true}, async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ok: false, message: "Método não permitido."});
      return;
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      res.status(401).json({ok: false, message: "Token de autenticação ausente."});
      return;
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const resultado = await gerenciarAgenteCondutor(req.body, decoded.uid);
    res.status(resultado.ok ? 200 : 400).json(resultado);
  } catch (error) {
    console.error("Erro na rota HTTP de agentes/condutores:", error);
    res.status(500).json({
      ok: false,
      message: error.message || "Erro interno ao gerenciar agente/condutor."
    });
  }
});

exports.listarAgentesCondutoresHttp = onRequest({cors: true}, async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ok: false, message: "Método não permitido."});
      return;
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      res.status(401).json({ok: false, message: "Token de autenticação ausente."});
      return;
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const resultado = await listarAgentesCondutores(decoded.uid);
    res.status(resultado.ok ? 200 : 400).json(resultado);
  } catch (error) {
    console.error("Erro na rota HTTP de listagem de agentes/condutores:", error);
    res.status(500).json({
      ok: false,
      message: error.message || "Erro interno ao listar agentes/condutores."
    });
  }
});
