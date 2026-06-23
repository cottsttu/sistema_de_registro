async function iniciarObservacoes() {
    const {initializeApp} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const {getFirestore, collection, addDoc, query, onSnapshot, orderBy, updateDoc, doc, serverTimestamp, getDoc, where, getDocs} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
    const {getAuth, onAuthStateChanged, signOut} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");

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

    const agentesDB = ["ADRIANA GOMES DA SILVA - 43.071-4", "ADRIANO ANDRÉ GUEDES COSTA - 43.079-0", "ADRIANO NASCIMENTO DA FONSECA - 49.991-9", "AFRÂNIO MEDEIROS DA COSTA - 43.151-6", "AGRICIO BELCHIOR BANDEIRA NETO - 43.127-3", "AILTON ANDRADE - 62.095-5", "ALCINEIDE JUSTO SIQUEIRA - 62.100-5", "ALDREY LUIZ MORAIS DA SILVA - 62.549-3", "ALDRIN MAGNO DANTAS SIQUEIRA - 43.080-3", "ALESSANDRA DORA DA SILVA COSTA - 43.199-1", "ALEX SERAFIM DA SILVA - 15.231-5", "ALEXANDRA BARROS DO NASCIMENTO - 49.953-6", "ALEXANDRE DE SOUZA - 13.174-1", "ALEXANDRE MAGNO FREITAS COSMO - 61.947-7", "ALEXSANDRO NASCIMENTO BARBOSA - 43.072-2", "ALYENE PATRICIA CRUZ BRITO ALVES - 64.545-0", "ALISSON EMANOEL DE OLIVEIRA FAGUNDES - 49.995-1", "ALLAN ARAÚJO DE MEDEIROS - 43.073-1", "ANA MARIA DA SILVA ALVES - 13.141-5", "ANDERSON RODRIGO DO NASCIMENTO - 63.802-1", "ANDRE CORCINO DE LIMA FILHO - 00.387-5", "ANDREA CASTRO GALVÃO - 62.097-1", "ANDREIA CARLA SILVA FONSECA E SOUZA - 14.071-6", "ANDREZA CABRAL CÂMARA NUNES - 61.710-5", "ANNE CAROLINE MACEDO DE ARAÚJO - 60.233-7", "ANTÃO LOPES DE ARAÚJO FILHO - 43.100-1", "ANTONIO CLEMENTINO DA ROCHA - 13.632-8", "ANTONIO GUILHERME DOS SANTOS - 14.206-9", "ANTONIO SARMENTO RODRIGUES FILHO - 13.634-4", "BARBARA KALYANA DOS SANTOS GOMES - 43.102-8", "CARLOS EUBER DE FREITAS NEVES - 43.077-3", "CARLOS EUGÊNIO BARBOSA DE OLIVEIRA - 00.282-8", "CARLOS VALENTIM ALVES - 13.140-7", "CARLYLE CÂMARA DOS SANTOS - 43.150-8", "CARMOZINA REGIA DE MELO DANTAS - 43.084-6", "CAROLINA DE CÁSSIA DEFENTE - 43.101-0", "CASSIO CLAY PEREIRA - 14.190-9", "CASTRICIANO BRAZ DOS SANTOS - 13.593-3", "CHIARA LUCIA DE GUMÃO GONÇALVES COSTA - 43.096-0", "CLAUDIA JACQUELINE GALVÃO SOUZA - 14.937-3", "CLEIDE MARIA DOS SANTOS SILVA - 13.614-0", "CLEONEIDE CORREIA RAMALHO RIBEIRO - 13.609-3", "CRISTIANE DE MACEDO E SILVA - 62.873-5", "DANIEL ALBURQUERQUE EMERENCIANO GONÇALVES - 43.090-1", "DANIELLE PEREIRA DE OLIVEIRA - 60.072-5", "DANILSON BENTES MARINHO - 13.116-4", "DAVI FIRMINO DE LIMA - 14.953-5", "DENÍLSON ARAÚJO DA COSTA - 60.090-3", "DIONISIO CARDOSO DA COSTA - 13.659-0", "DANILO CLAUDIO LIRA DOS SANTOS - 72.245-7", "EDÍLSON FERREIRA DOS SANTOS - 00.417-1", "EDILSON OLIVEIRA DA SILVA - 13.147-4", "EDINALVA DUARTE LEAL DE MEDEIROS - 00.463-4", "EDINÁSIO COSTA SOARES - 49.986-2", "EDJA DE PAULA MAIA - 45.570-9", "EDSON RAIMUNDO DA SILVA - 13.463-5", "EDVALDO MANOEL DA SILVA - 00.465-1", "EDVALDO SOARES DA SILVA - 09.325-4", "ELIZABETE RANYELA MORAIS DE MOURA - 43.198-2", "ERNESTO MORAIS VIANA - 14.930-6", "EVALDO FELIX FERREIRA - 00.518-5", "EVERALDO ALEXANDRE FREIRE - 14.043-1", "FERNANDA FREITAS DE HOLANDA - 60.066-1", "FRANCISCO GILSON LEONIDAS DA SILVA - 13.679-4", "FRANZ BIAGGIO FULCO GAAG - 65.247-4", "GENALDO AZEVEDO TRINDADE - 43.086-2", "GILDIBERTO DE SOUZA ALVES - 08.646-1", "GILMAR GOMES DO NASCIMENTO - 06.726-1", "GUTEMBERG PEREIRA - 08.015-2", "HAILSON CABRAL DO NASCIMENTO - 00.375-1", "HARLLEY CAMPOS MARQUES - 65.420-5", "HEITOR RODRIGUES DE LIMA - 43.097-8", "HEMERSON MELO DA SILVA - 49.952-8", "HERANDY DE ARAÚJO CABRAL - 49.950-1", "HERQUILES LIMA DOS SANTOS - 43.149-4", "HEWERTON MOURA DA SILVA - 43.098-6", "ISABELA SILVA NICÁCIO DE BRITO - 60.234-5", "ISRAEL FERREIRA PEREIRA - 13.110-5", "IVAN DE CARVALHO MEDEIROS - 00.431-6", "IVES SILVA DE SOUZA - 62.151-0", "JAIR JEFFERSON DE CARVALHO - 13.896-7", "JARDEL BEZERRA DE ANDRADE - 62.189-7", "JARDS MEDEIROS DE OLIVEIRA - 62.826-3", "JATSON FRANCISCO DA SILVA BANDEIRA - 13.727-8", "JEFFERSON STANLEY DA SILVA - 62.919-7", "JOÃO BATISTA MONTEIRO DE AQUINO - 00.482-1", "JOÃO BATISTA ROCHA FILHO - 49.994-3", "JOÃO BATISTA VARELA BARCA - 15.710-4", "JOÃO CLAUDIO OLIVEIRA DE FARIAS - 00.383-2", "JOÃO FERREIRA - 06.644-3", "JOÃO MARIA ALMEIDA DE MOURA - 43.070-6", "JOÃO MARIA MACEDO ROCHA - 43.201-6", "JOÃO PAULO DE OLIVEIRA - 43.082-0", "JOÃO WILLAMS DA SILVA - 62.253-2", "JONAS CRISTINO DA SILVA - 14.931-4", "JORGE LUIZ BARROS DO NASCIMENTO - 62.431-4", "JORGE LUIZ SIQUEIRA DE OLIVEIRA - 62.191-9", "JOSÉ EUDES BEZERRA - 49.985-4", "JOSÉ ALBERTO FREIRE DA COSTA - 42.766-7", "JOSE ALVES DE SOUZA NETO - 00.544-4", "JOSE AUTEMAR RICARDO - 00.475-8", "JOSE DINIZ RAMOS - 00.575-4", "JOSE EBER DA SILVA - 13.105-9", "JOSÉ GONÇALVES MANGABEIRA DE MEDEIROS - 43.083-8", "JOSÉ RICARDO GOMES CAVALCANTE - 13.102-4", "JOSE ROBERTO DA SILVA DE OLIVEIRA - 14.922-5", "JOSÉ ROOSEVELT MEDEIROS JÚNIOR - 62.416-1", "JOSEMAR DA SILVA DAMASCENO - 60.068-7", "JOSEMAR TAVARES CÂMARA JUNIOR - 43.152-4", "JOSENILSON TEIXEIRA DE SOUZA - 00.386-7", "KASTEEN CARLOS DE AQUINO E SILVA - 43.076-5", "KLEBER SILVESTRE LUSTOSA - 49.825-4", "LAILTON RIBEIRO DA COSTA - 43.078-1", "LEONARDO BATISTA DE SOUZA SILVA - 64.542-7", "LEONARDO DA SILVEIRA LUCENA - 43.122-2", "MADSON LIMA CAVALCANTI DE OLIVEIRA - 49.989-7", "MANOEL NOBREGA DE OLIVEIRA - 13.758-8", "MARA LUCIA BARROS DE SOUZA - 70.665-5", "MARCELO BATISTA DE ANDRADE - 61.952-3", "MARCELO FRANÇA DA SILVA - 60.073-3", "MARCELO ZAERDSON LINS MEDEIROS - 62.184-6", "MARCILIO DE OLIVEIRA RODRIGUES - 49.951-0", "MÁRCIO JOSÉ DA SILVA - 68.159-8", "MARCOS ANTONIO DE OLIVEIRA - 07.326-1", "MARIA DE LOURDES DA SILVA FILHA - 43.200-8", "MARIA DO CARMO DA SILVA - 00.571-1", "MARIA DO SOCORRO LIMA MARTINS - 14.070-8", "MARIA DO SOCORRO SILVA DE ANDRADE - 14.114-3", "MARIA GORETE DUTRA DE OLIVEIRA - 13.988-2", "MARIA JANEIDE BEZERRA DA SILVA - 00.536-3", "MARIA SANTANA BORGES DA SILVA - 00.561-4", "MARIO JOSE DA SILVA LEMOS - 14.944-6", "MARISA GILVANEIDE BERTO - 00.538-0", "MARYANE CRISTINA LOPES PEREIRA - 43.112-5", "MAXIMIANO CAPIM DE MIRANDA - 13.462-7", "MAXWELL FERNANDES DA SILVA - 13.136-9", "MIGUEL ÂNGELO DE SANTANA - 62.092-1", "MOISES PEREIRA DE ARAUJO - 08.229-5", "NADJANIA MARIA DAMASCENO VALLE - 62.368-7", "NAOMI SUASSUNA DOS SANTOS - 60.237-0", "NEUZELIDES PRISCILA SILVA ANDRADE - 49.949-8", "NEWDENBERG FERREIRA GALVÃO - 43.081-1", "NEWTON DE SOUZA PEREIRA FILHO - 60.064-4", "NUBIA SILENE DA SILVA COSTA - 14.109-7", "PATRÍCIA CRISTINA CAVALCANTE - 45.990-9", "RAIMUNDO NONATO DE MEDEIROS NETO - 00.249-6", "RAPHAELLE CAVALCANTE R. DE ARAUJO - 62.149-8", "RECIO RONALDO ANDRADE DE PAIVA - 09.532-0", "REGINA VICÊNCIA CRISPIM - 62.250-8", "RICARDO SERGIO GOMES DA SILVA - 13.477-5", "RITA DE CÁSSIA SILVA - 49.992-7", "ROBSON LUIZ DE AZEVEDO - 00.184-8", "RODRIGO COSTA - 43.087-1", "ROGELIO FERNANDES DE MELO - 13.095-8", "RONALDO JORGE DA SILVA - 13.096-6", "RONALDO MARINHO DE SOUZA - 62.825-5", "RONALDO TEIXEIRA DE ARAÚJO - 62.257-5", "ROSEMBERG PEREIRA - 00.137-6", "SANDRA DA SILVA BEZERRIL BACELAR - 61.712-1", "SARAH POLYANA DIAS DOS SANTOS - 43.154-1", "SEVERINA SOARES NETA CARNEIRO - 00.327-1", "SEVERINO FERNANDES MAIA - 00.192-9", "SEVERINO SOLANO DA SILVA - 00.486-3", "SOLANO LOPES DANTAS - 00.663-7", "SYBELLE DE ARAÚJO DANTAS - 63.386-1", "TALITHA LOUISE FORTUNATO BEZERRA - 49.990-1", "THALES GALVÃO DE ARAUJO - 63.803-0", "THALLES THIAGO MEDEIROS DE SOUZA - 49.988-9", "THIAGO DE LIRA BEZERRA - 43.075-7", "THIAGO HENRIQUE FERREIRA DA SILVA - 60.275-2", "VALDELICE FERREIRA DE OLIVEIRA - 00.507-0", "VANESSA GALDINO DA SILVA - 61.955-8", "WALDICK GUERRA DE MEDEIROS - 13.281-1", "WALTER PEDRO DA SILVA - 00.358-1", "WANDERCLEY SILVA NEVES - 70.563-2", "WANDRÉ WAGNER DA SILVA - 62.367-9", "ZELIO CUNHA - 13.400-7"];

    let nomeUsuarioLogado = "ANÔNIMO";
    let isVisualizador = false;

    window.onload = () => {
        const selectAfast = document.getElementById('afast-lista-agentes');
        selectAfast.innerHTML = '<option value="">-- SELECIONE NA LISTA --</option>';
        
        const dataList = document.getElementById('listaAgentes');
        dataList.innerHTML = '';

        agentesDB.forEach(agente => {
            const optSelect = document.createElement('option');
            optSelect.value = agente;
            optSelect.innerText = agente;
            selectAfast.appendChild(optSelect);

            const optData = document.createElement('option');
            optData.value = agente;
            dataList.appendChild(optData);
        });

        document.getElementById('turno-select').value = "SELECIONE";
        const btn = document.getElementById('btn-registrar-inicio');
        btn.disabled = false;
        btn.innerText = "REGISTRAR INÍCIO DE TURNO";
        btn.style.backgroundColor = "#27ae60";

        document.querySelectorAll('.verificar-item').forEach(el => {
            el.addEventListener('input', function() {
                this.classList.remove('input-pendente');
                this.classList.add('input-ok');
            });
        });
    };

    function resetarEquipamentos() {
        const ids = [
            'qtd-cel-atend', 'qtd-fonte-cel', 'qtd-cabo-cel', 'qtd-zap',
            'qtd-radio-movel', 'qtd-impressora', 'qtd-ar', 'qtd-m4744',
            'qtd-m4746', 'qtd-m4750', 'qtd-m4751', 'qtd-m4756', 'qtd-m4754', 'qtd-radio-fixo'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            el.value = "0";
            el.classList.remove('input-ok');
            el.classList.add('input-pendente');
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const docRef = doc(db, "usuarios", user.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const dados = docSnap.data();
                    
                    nomeUsuarioLogado = dados.nome || "Usuário";
                    document.getElementById('nomeUsuarioDisplay').innerText = "OLÁ, " + nomeUsuarioLogado;

                    const nivel = dados.nivel_acesso || 'total';
                    const cargo = dados.cargo || '';
                    
                    isVisualizador = (nivel === 'leitura' || cargo === 'visualizador') && cargo !== 'admin';

                    if (isVisualizador) {
                        console.log("🔒 MODO APENAS LEITURA ATIVADO (NUCLEAR)");
                        
                        const areaInputs = document.querySelector('.input-section');
                        if(areaInputs) areaInputs.remove();

                        const areaModal = document.getElementById('modalDevolucao');
                        if(areaModal) areaModal.remove();

                        const style = document.createElement('style');
                        style.innerHTML = '.btn-baixa, .btn-baixa-falta { display: none !important; }';
                        document.head.appendChild(style);
                        
                        window.darBaixaNoFirebase = () => alert("Acesso Negado: Modo Visualizador.");
                        window.abrirModalFalta = () => alert("Acesso Negado: Modo Visualizador.");
                    }

                    if (dados.cargo !== 'admin') {
                        const btnRel = document.getElementById('btnNavRelatorios');
                        if (btnRel) btnRel.style.display = 'none';
                    }

                    if (dados.cargo !== 'visualizador') {
                        let tempoInatividade;
                        const LIMITE_TEMPO = 30 * 60 * 1000; 
                        const resetarTimer = () => {
                            clearTimeout(tempoInatividade);
                            tempoInatividade = setTimeout(() => {
                                alert("⚠️ Sessão encerrada por inatividade (30min).");
                                signOut(auth).then(() => window.location.href = "login.html");
                            }, LIMITE_TEMPO);
                        };
                        window.onload = resetarTimer; document.onmousemove = resetarTimer; document.onkeypress = resetarTimer; document.onclick = resetarTimer; document.onscroll = resetarTimer;
                    }
                } else {
                    alert("Erro de cadastro. Contate o suporte.");
                    await signOut(auth);
                    window.location.href = "login.html";
                }
            } catch (error) { console.error("Erro:", error); }
        } else {
            window.location.href = "login.html";
        }
    });

    const btnSair = document.getElementById('btnSair');
    if(btnSair) {
        btnSair.onclick = () => { signOut(auth).then(() => { window.location.href = "login.html"; }); }
    }

    function getDataHojeISO() {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }
    function getDataHojeBR() {
        const hoje = new Date();
        return hoje.toLocaleDateString('pt-BR');
    }
    document.getElementById('displayData').innerText = "DATA: " + getDataHojeBR();

    const dataFiltro = getDataHojeISO();
    
    const q = query(
        collection(db, "observacoes_sttu"), 
        where("data_filtro", "==", dataFiltro)
    );

    onSnapshot(q, (snapshot) => {
        const lista = document.getElementById('lista-registros');
        lista.innerHTML = "";
        
        if (snapshot.empty) {
            lista.innerHTML = "<em>Nenhum registro encontrado para hoje.</em>";
            return;
        }

        let registros = [];
        snapshot.forEach(doc => { registros.push({ id: doc.id, ...doc.data() }); });

        registros.sort((a, b) => {
            const tA = a.timestamp ? a.timestamp.seconds : 0;
            const tB = b.timestamp ? b.timestamp.seconds : 0;
            return tB - tA; 
        });

        registros.forEach(data => {
            const id = data.id;
            const horaFormatada = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleString('pt-BR') : "Processando...";
            
            const item = document.createElement('div');
            item.className = 'registro-item';
            
            let html = `
                <div class="timestamp">[${horaFormatada}]</div>
                <div class="texto-registro">
                    <span>${data.texto}</span>
                    ${data.baixa ? `<span class="status-devolvido">| DEVOLVIDO ÀS ${data.baixa}</span>` : ""}
                </div>
            `;

            if (data.requerBaixa && !data.baixa && !isVisualizador) {
                const btnContainer = document.createElement('div');
                btnContainer.style.display = 'flex';
                btnContainer.style.flexDirection = 'column';
                btnContainer.style.gap = '5px';
                
                const btnBaixa = document.createElement('button');
                btnBaixa.className = 'btn btn-baixa';
                btnBaixa.innerText = 'DAR BAIXA / DEVOLVER';
                btnBaixa.onclick = () => window.darBaixaNoFirebase(id);
                
                const btnBaixaFalta = document.createElement('button');
                btnBaixaFalta.className = 'btn btn-baixa-falta';
                btnBaixaFalta.innerText = 'DEVOLVER C/ MATERIAIS EM FALTA';
                btnBaixaFalta.onclick = () => window.abrirModalFalta(id, data.texto); 

                btnContainer.appendChild(btnBaixa);
                btnContainer.appendChild(btnBaixaFalta);
                
                item.innerHTML = html;
                item.appendChild(btnContainer);
            } else {
                item.innerHTML = html;
            }
            
            lista.appendChild(item);
        });
    });

    async function salvarObservacao(texto, requerBaixa = false, extras = {}) {
        if (isVisualizador) return alert("Acesso Negado: Modo Visualizador.");

        try {
            const dados = {
                texto: texto.toUpperCase(),
                requerBaixa: requerBaixa,
                baixa: null,
                timestamp: serverTimestamp(),
                data_filtro: getDataHojeISO(), 
                ...extras
            };

            await addDoc(collection(db, "observacoes_sttu"), dados);
            registrarLogAuditoria("NOVA OBSERVAÇÃO", `Texto: "${texto.substring(0, 50)}..."`);

        } catch (e) {
            console.error("Erro ao salvar: ", e);
            alert("Erro ao conectar com o banco de dados.");
        }
    }

    async function registrarLogAuditoria(acao, detalhes) {
        if (isVisualizador) return; 
        try {
            await addDoc(collection(db, "logs_auditoria"), {
                usuario: nomeUsuarioLogado || "DESCONHECIDO",
                acao: acao.toUpperCase(),
                detalhes: detalhes,
                timestamp: serverTimestamp()
            });
        } catch (e) { console.error(e); }
    }

    window.darBaixaNoFirebase = async (idDoc) => {
        if (isVisualizador) return alert("Acesso Negado.");
        const conferente = prompt("POR FAVOR, DIGITE O NOME DO AGENTE QUE ESTÁ CONFERINDO A DEVOLUÇÃO:");
        if (!conferente || conferente.trim() === "") return;

        const agora = new Date().toLocaleTimeString('pt-BR');
        const docRef = doc(db, "observacoes_sttu", idDoc);
        const docSnap = await getDoc(docRef);
        const textoComConferencia = docSnap.data().texto + ` | CONFERIDO POR: ${conferente.toUpperCase()}`;

        await updateDoc(docRef, { baixa: agora, texto: textoComConferencia });
        registrarLogAuditoria("BAIXA DE MATERIAL", `Item devolvido (ID: ${idDoc}). Conferido por: ${conferente}`);
    }

    // --- NOVA FUNÇÃO DO MODAL (ATUALIZADA) ---
    window.abrirModalFalta = (id, texto) => {
        if (isVisualizador) return alert("Acesso Negado.");
        document.getElementById('id-devolucao-atual').value = id;

        // Função hiper-resistente que ignora pontuações e espaços para achar o número exato
        const extrairQtd = (chave, padrao) => {
            if (!texto) return padrao;
            try {
                // Procura o nome da chave, ignora o que não for número (\D*) e captura os números (\d+)
                const regex = new RegExp(`${chave}\\D*(\\d+)`, 'i');
                const match = String(texto).match(regex);
                return match ? match[1] : padrao;
            } catch (e) {
                return padrao;
            }
        };

        // Preenchendo as caixas do modal com os valores exatos que foram entregues
        document.getElementById('dev-etil').value = extrairQtd("ETIL", 1);
        document.getElementById('dev-piteira').value = extrairQtd("PITEIRA", 2);
        document.getElementById('dev-impressora').value = extrairQtd("IMP", 1);
        document.getElementById('dev-carregadores').value = extrairQtd("CARR", 5);
        document.getElementById('dev-bobina').value = extrairQtd("BOB", 1);
        document.getElementById('dev-boat').value = extrairQtd("BOAT", 2);
        document.getElementById('dev-certificado').value = extrairQtd("CERT", 2);
        document.getElementById('dev-tc').value = extrairQtd("TC", 2);
        document.getElementById('dev-manual').value = extrairQtd("MAN", 2);

        // Limpa o campo do nome para não ficar salvo o nome da última devolução
        document.getElementById('dev-responsavel').value = "";

        document.getElementById('modalDevolucao').style.display = 'flex';
    };

    window.fecharModal = () => document.getElementById('modalDevolucao').style.display = 'none';

    window.confirmarBaixaComFalta = async () => {
        if (isVisualizador) return alert("Acesso Negado.");
        const idDoc = document.getElementById('id-devolucao-atual').value;
        const conferente = document.getElementById('dev-responsavel').value.trim().toUpperCase();
        if (!conferente) return alert("Informe quem conferiu.");

        const agora = new Date().toLocaleTimeString('pt-BR');
        const docRef = doc(db, "observacoes_sttu", idDoc);
        
        const etil = document.getElementById('dev-etil').value;
        const piteira = document.getElementById('dev-piteira').value;
        const imp = document.getElementById('dev-impressora').value;
        const car = document.getElementById('dev-carregadores').value;
        const bob = document.getElementById('dev-bobina').value;
        const boat = document.getElementById('dev-boat').value;
        const cert = document.getElementById('dev-certificado').value;
        const tc = document.getElementById('dev-tc').value;
        const manual = document.getElementById('dev-manual').value;

        const docSnap = await getDoc(docRef);
        const obsFalta = `\n[DEVOLUÇÃO C/ PENDÊNCIA: ETIL:${etil}, PITEIRA:${piteira}, IMP:${imp}, CARR:${car}, BOB:${bob}, BOAT:${boat}, CERT:${cert}, TC:${tc}, MAN:${manual}] | CONFERIDO POR: ${conferente}`;

        await updateDoc(docRef, { baixa: agora, texto: docSnap.data().texto + obsFalta });
        registrarLogAuditoria("BAIXA COM FALTA", `Item devolvido com pendências (ID: ${idDoc}). Conferido por: ${conferente}`);

        fecharModal();
    };

    document.querySelectorAll('.btn-linha').forEach(btn => {
        btn.onclick = () => {
            if (isVisualizador) return;
            if (btn.classList.contains('ok')) { btn.classList.remove('ok'); btn.classList.add('nok'); }
            else if (btn.classList.contains('nok')) { btn.classList.remove('nok'); }
            else { btn.classList.add('ok'); }
        };
    });

    document.getElementById('turno-select').addEventListener('change', async function() {
        if (isVisualizador) return;
        const turno = this.value;
        const btn = document.getElementById('btn-registrar-inicio');

        if (turno === "SELECIONE") {
            btn.disabled = false;
            btn.innerText = "REGISTRAR INÍCIO DE TURNO";
            btn.style.backgroundColor = "#27ae60"; 
            return;
        }

        btn.disabled = true;
        btn.innerText = "VERIFICANDO DISPONIBILIDADE...";

        const qVerificacao = query(
            collection(db, "observacoes_sttu"), 
            where("tipo_registro", "==", "INICIO_TURNO"),
            where("data_controle", "==", getDataHojeISO()), 
            where("turno_controle", "==", turno)
        );

        const snapshot = await getDocs(qVerificacao);

        if (!snapshot.empty) {
            btn.innerText = `TURNO ${turno} JÁ REGISTRADO!`;
            btn.style.backgroundColor = "#95a5a6"; 
            btn.disabled = true;
        } else {
            btn.innerText = "REGISTRAR INÍCIO DE TURNO";
            btn.style.backgroundColor = "#27ae60"; 
            btn.disabled = false;
        }
    });

    document.getElementById('btn-registrar-inicio').onclick = async () => {
        if (isVisualizador) return;
        const btn = document.getElementById('btn-registrar-inicio');
        btn.disabled = true;

        const turno = document.getElementById('turno-select').value;
        const nomeAgente = document.getElementById('agente-turno-nome').value.trim().toUpperCase();

        if (turno === "SELECIONE" || !nomeAgente) {
             alert("Preencha Turno e Nome do Agente.");
             btn.disabled = false; return;
        }

        const textoOperadora = document.getElementById('texto-operadora').value.trim();
        if (!textoOperadora) {
            alert("⚠️ É obrigatório preencher a situação das OPERADORAS.");
            document.getElementById('texto-operadora').focus();
            btn.disabled = false; return;
        }

        const btnLinhas = document.querySelectorAll('.btn-linha');
        let todosTestados = true;
        btnLinhas.forEach(b => {
            if (!b.classList.contains('ok') && !b.classList.contains('nok')) { todosTestados = false; }
        });

        if (!todosTestados) {
            alert("⚠️ É OBRIGATÓRIO verificar todos os números de telefone.");
            btn.disabled = false; return;
        }

        const inputsEquip = document.querySelectorAll('.verificar-item');
        let equipPendente = false;
        inputsEquip.forEach(el => {
            if (el.classList.contains('input-pendente')) {
                equipPendente = true;
            }
        });

        if (equipPendente) {
            alert("⚠️ É OBRIGATÓRIO conferir todos os itens (Os campos em VERMELHO devem ser clicados/modificados).");
            btn.disabled = false; return;
        }

        const qVerificacao = query(
            collection(db, "observacoes_sttu"), 
            where("tipo_registro", "==", "INICIO_TURNO"),
            where("data_controle", "==", getDataHojeISO()), 
            where("turno_controle", "==", turno)
        );
        const snapshot = await getDocs(qVerificacao);
        
        if (!snapshot.empty) {
            alert(`ERRO: O turno ${turno} já foi registrado!`);
            btn.innerText = `TURNO ${turno} JÁ REGISTRADO!`;
            btn.style.backgroundColor = "#95a5a6";
            return;
        }

        let statusLinhas = [];
        btnLinhas.forEach(b => {
            if (b.classList.contains('ok')) statusLinhas.push(`${b.getAttribute('data-num')}: OK`);
            else if (b.classList.contains('nok')) statusLinhas.push(`${b.getAttribute('data-num')}: INOPERANTE`);
        });
        const textoLinhas = statusLinhas.length > 0 ? ` | LINHAS: ${statusLinhas.join(', ')}` : "";

        const detalhes = `SERVIÇO INICIADO TURNO ${turno} - AGENTE: ${nomeAgente}${textoLinhas}. ` +
            `OPERADORAS: ${textoOperadora.toUpperCase()}. ` + 
            `CONFERÊNCIA: ` +
            `CEL.ATEND:${document.getElementById('qtd-cel-atend').value}, ` +
            `FONTE:${document.getElementById('qtd-fonte-cel').value}, ` +
            `CABO:${document.getElementById('qtd-cabo-cel').value}, ` +
            `ZAP:${document.getElementById('qtd-zap').value}, ` +
            `RAD.MOV:${document.getElementById('qtd-radio-movel').value}, ` +
            `IMP:${document.getElementById('qtd-impressora').value}, ` +
            `AR:${document.getElementById('qtd-ar').value}, ` +
            `M.4744:${document.getElementById('qtd-m4744').value}, ` +
            `M.4746:${document.getElementById('qtd-m4746').value}, ` +
            `M.4750:${document.getElementById('qtd-m4750').value}, ` +
            `M.4751:${document.getElementById('qtd-m4751').value}, ` +
            `M.4756:${document.getElementById('qtd-m4756').value}, ` +
            `M.4754:${document.getElementById('qtd-m4754').value}, ` +
            `RAD.FIX:${document.getElementById('qtd-radio-fixo').value}`;
        
        await salvarObservacao(detalhes, false, {
            tipo_registro: "INICIO_TURNO",
            data_controle: getDataHojeISO(),
            turno_controle: turno
        });
        
        registrarLogAuditoria("INÍCIO DE TURNO", `Turno ${turno} iniciado por ${nomeAgente}`);
        alert("Início registrado com sucesso!");
        btn.innerText = "REGISTRADO COM SUCESSO";
        resetarEquipamentos();
        document.getElementById('texto-operadora').value = "";
    };

    document.getElementById('btn-registrar-maleta').onclick = async () => {
        if (isVisualizador) return;
        const nomeAgente = document.getElementById('agente-turno-nome').value.trim().toUpperCase();
        if (!nomeAgente) { alert("Preencha o Nome do Agente no topo primeiro."); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }

        let maleta = document.getElementById('maleta-selecionada').value;
        const maletaCustomizada = document.getElementById('maleta-customizada').value.trim();
        
        if (maletaCustomizada) {
            maleta = maletaCustomizada;
        }
        
        const entreguePara = document.getElementById('entregue-para').value.trim().toUpperCase();
        if (!entreguePara) {
            alert("⚠️ CAMPO OBRIGATÓRIO: Informe para quem a maleta/item foi entregue.");
            document.getElementById('entregue-para').focus();
            return;
        }

        const obs = document.getElementById('obs-extras').value.trim();

        if (maleta) {
            const qCheck = query(collection(db, "observacoes_sttu"), 
                where("tipo_registro", "==", "ENTREGA_MALETA"),
                where("numero_maleta", "==", maleta),
                where("baixa", "==", null) 
            );
            const snapshot = await getDocs(qCheck);
            
            if (!snapshot.empty) {
                const docPreso = snapshot.docs[0];
                const confirmar = confirm(`ERRO: A maleta ${maleta} consta como EM USO por outro agente desde ${new Date(docPreso.data().timestamp.seconds * 1000).toLocaleString()}.\n\nDeseja FORÇAR a devolução da anterior para liberar esta nova entrega?`);
                if (confirmar) {
                   await updateDoc(doc(db, "observacoes_sttu", docPreso.id), { 
                       baixa: new Date().toLocaleTimeString('pt-BR') + " (FORÇADO)", 
                       texto: docPreso.data().texto + " | BAIXA FORÇADA PELO SISTEMA PARA NOVA ENTREGA" 
                   });
                   alert("Registro anterior baixado. Tente registrar novamente agora.");
                   return;
                } else { return; }
            }
        }

        const qtdEtil = document.getElementById('qtd-etil').value;
        const qtdPiteira = document.getElementById('qtd-piteira').value;
        const qtdImp = document.getElementById('qtd-impressora-maleta').value;
        const qtdCar = document.getElementById('qtd-carregadores').value;
        const qtdBob = document.getElementById('qtd-bobina').value;
        const qtdBoat = document.getElementById('qtd-boat').value;
        const qtdCert = document.getElementById('qtd-certificado').value;
        const qtdTc = document.getElementById('qtd-tc').value;
        const qtdMan = document.getElementById('qtd-manual').value;

        const detalhes = `ENTREGA ${maleta ? 'DA MALETA '+maleta : 'DE EQUIPAMENTOS'}. ` +
            `RETIRADO POR: ${nomeAgente}. ` + 
            `ENTREGUE PARA: ${entreguePara}. ` + 
            `ITENS: ETIL:${qtdEtil}, PITEIRA:${qtdPiteira}, IMP:${qtdImp}, CARR:${qtdCar}, BOB:${qtdBob}, ` +
            `BOAT:${qtdBoat}, CERT:${qtdCert}, TC:${qtdTc}, MAN:${qtdMan} ${obs ? '| OBS: '+obs : ''}`;
        
        await salvarObservacao(detalhes, true, {
            tipo_registro: "ENTREGA_MALETA",
            numero_maleta: maleta || "OUTROS"
        });

        document.querySelectorAll('.btn-maleta').forEach(b => b.classList.remove('selecionada'));
        document.getElementById('maleta-selecionada').value = "";
        document.getElementById('maleta-customizada').value = "";
        document.getElementById('obs-extras').value = "";
        document.getElementById('entregue-para').value = ""; 
    };

    document.getElementById('btn-registrar-tentante').onclick = () => {
        if (isVisualizador) return;
        const campo = document.getElementById('texto-tentante');
        if (campo.value.trim()) { salvarObservacao(`REGISTRO DE TENTANTE: ${campo.value.trim()}`); campo.value = ""; }
    };

    document.getElementById('btn-registrar-afastamento').onclick = () => {
        if (isVisualizador) return;
        const nomeLista = document.getElementById('afast-lista-agentes').value;
        const nomeDigitado = document.getElementById('afast-nome').value.trim();
        const nomeFinal = nomeLista || nomeDigitado;
        const local = document.getElementById('afast-local').value.trim();
        const status = document.getElementById('afast-status').value;

        if (!nomeFinal) return alert("Informe o agente.");
        salvarObservacao(`AUSÊNCIA: . ${nomeFinal.toUpperCase()} - LOCAL: ${local.toUpperCase()} - SITUAÇÃO: ${status}`);
        document.getElementById('afast-lista-agentes').value = "";
        document.getElementById('afast-nome').value = "";
        document.getElementById('afast-local').value = "";
    };

    document.getElementById('btn-registrar-remocao').onclick = () => {
    if (isVisualizador) return;

    // Coleta de todos os campos
    const placa = document.getElementById('rem-placa').value.trim().toUpperCase();
    const equipe = document.getElementById('rem-equipe').value.trim().toUpperCase();
    const local = document.getElementById('rem-local').value.trim().toUpperCase();
    const motivo = document.getElementById('rem-motivo').value.trim().toUpperCase();
    const ait = document.getElementById('rem-ait').value.trim().toUpperCase();
    const trv = document.getElementById('rem-trv').value.trim().toUpperCase();

    // Validação básica
    if (!placa || !motivo) return alert("Preencha ao menos Placa e Motivo.");

    // Montagem do texto incluindo AIT e TRV
    let textoFinal = `VEÍCULO REMOVIDO: PLACA ${placa}`;
    if (equipe) textoFinal += ` - EQUIPE: ${equipe}`;
    if (local)  textoFinal += ` - LOCAL: ${local}`;
    textoFinal += ` - MOTIVO: ${motivo}`;
    if (ait)    textoFinal += ` - AIT: ${ait}`;
    if (trv)    textoFinal += ` - TRV: ${trv}`;

    // Salva no banco de dados
    salvarObservacao(textoFinal);

    // Limpa os campos após o sucesso
    document.getElementById('rem-placa').value = "";
    document.getElementById('rem-equipe').value = "";
    document.getElementById('rem-local').value = "";
    document.getElementById('rem-motivo').value = "";
    document.getElementById('rem-ait').value = "";
    document.getElementById('rem-trv').value = "";
    
    alert("Remoção registrada com sucesso!");
};
    
    document.getElementById('btn-registrar-inspetor').onclick = () => {
        if (isVisualizador) return;
        const relato = document.getElementById('texto-inspetor').value.trim();
        if (relato) { salvarObservacao(`RELATO DO INSPETOR: ${relato}`); document.getElementById('texto-inspetor').value = ""; }
    };

    document.getElementById('btn-registrar-obs-geral').onclick = () => {
        if (isVisualizador) return;
        const obs = document.getElementById('texto-obs-geral').value.trim();
        if (obs) { salvarObservacao(`OBSERVAÇÃO GERAL: ${obs}`); document.getElementById('texto-obs-geral').value = ""; }
    };

    document.getElementById('btn-registrar-cones').onclick = () => {
        if (isVisualizador) return;
        const equipe = document.getElementById('cone-equipe').value;
        const local = document.getElementById('cone-local').value.trim().toUpperCase();
        let col = parseInt(document.getElementById('cone-colocado').value) || 0;
        let rec = parseInt(document.getElementById('cone-recolhido').value) || 0;
        const obs = document.getElementById('cone-obs').value.trim().toUpperCase();
        
        let total = parseInt(document.getElementById('total-cones-geral').value) || 0;
        total = total - col + rec;
        document.getElementById('total-cones-geral').value = total;
        
        salvarObservacao(`CONTROLE DE CONES: ${equipe} - LOCAL: ${local} - COLOCADOS: ${col} - RECOLHIDOS: ${rec} - OBS: ${obs} - SALDO: ${total}`);
        document.getElementById('cone-local').value = "";
        document.getElementById('cone-colocado').value = "";
        document.getElementById('cone-recolhido').value = "";
        document.getElementById('cone-obs').value = "";
    };

    document.getElementById('btn-registrar-complementar').onclick = () => {
        if (isVisualizador) return;
        const nome = document.getElementById('comp-nome').value.trim().toUpperCase();
        const funcao = document.getElementById('comp-funcao').value.trim().toUpperCase();
        if (nome && funcao) {
            const textoFinal = `EQUIPE COMPLEMENTAR: NOME: ${nome} - FUNÇÃO: ${funcao}`;
            salvarObservacao(textoFinal);
            document.getElementById('comp-nome').value = "";
            document.getElementById('comp-funcao').value = "";
        } else {
            alert("Preencha o nome e a função!");
        }
    };

    document.querySelectorAll('.btn-maleta').forEach(botao => {
        botao.onclick = () => {
            const selecionada = botao.classList.contains('selecionada');
            document.querySelectorAll('.btn-maleta').forEach(b => b.classList.remove('selecionada'));
            if (!selecionada) {
                botao.classList.add('selecionada');
                document.getElementById('maleta-selecionada').value = botao.getAttribute('data-id');
                document.getElementById('maleta-customizada').value = "";
            } else {
                document.getElementById('maleta-selecionada').value = "";
            }
        };
    });

    document.getElementById('maleta-customizada').addEventListener('input', function() {
        document.querySelectorAll('.btn-maleta').forEach(b => b.classList.remove('selecionada'));
        document.getElementById('maleta-selecionada').value = "";
    });
}

iniciarObservacoes().catch((error) => {
    console.error("Erro ao carregar observacoes:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexão e atualize a página.");
});




