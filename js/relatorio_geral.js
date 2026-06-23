async function iniciarRelatorioGeral() {
    const {initializeApp} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const {getFirestore, collection, getDocs, query, where, orderBy, doc, getDoc} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
    const {getAuth, onAuthStateChanged, signOut} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");const firebaseConfig = {
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

        document.getElementById('btnSair')?.addEventListener('click', () => {
            if (confirm("Deseja realmente sair?")) {
                signOut(auth).then(() => window.location.href = "login.html");
            }
        });

        async function carregarImagemPdf(caminho) {
            if (window.STTU_EMBLEMA_DATA_URL) return window.STTU_EMBLEMA_DATA_URL;
            const url = new URL(caminho, window.location.href).href;
            return await new Promise(async (resolve, reject) => {
                const timeoutId = setTimeout(() => reject(new Error("Tempo excedido ao carregar emblema.")), 1500);
                try {
                    const resposta = await fetch(url, { cache: "force-cache" });
                    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
                    const blob = await resposta.blob();
                    const reader = new FileReader();
                    reader.onload = () => {
                        clearTimeout(timeoutId);
                        resolve(reader.result);
                    };
                    reader.onerror = () => {
                        clearTimeout(timeoutId);
                        reject(reader.error || new Error("Falha ao ler emblema."));
                    };
                    reader.readAsDataURL(blob);
                } catch (error) {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            });
        }

        async function adicionarEmblemaPdf(doc, x = 14, y = 8, largura = 24, altura = 24) {
            try {
                const emblema = await carregarImagemPdf("src/emblemasttu.jpeg");
                doc.addImage(emblema, "JPEG", x, y, largura, altura);
            } catch (error) {
                console.error("Erro ao inserir o emblema no PDF:", error);
            }
        }

        const hoje = new Date().toISOString().split('T')[0];
        document.getElementById('dataInicio').value = hoje;
        document.getElementById('dataFim').value = hoje;

        let isAdmin = false;

        // --- SEGURANÇA E VERIFICAÇÃO DE ADMIN ---
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const docRef = doc(db, "usuarios", user.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const dados = docSnap.data();
                    if (dados.cargo === 'admin') {
                        isAdmin = true;
                        document.getElementById('msgAdmin').style.display = 'block';
                    }
                }
            } else {
                window.location.href = "login.html";
            }
        });

        function formatarDataBR(dataISO) {
            const partes = dataISO.split('-');
            return `${partes[2]}/${partes[1]}/${partes[0]}`;
        }

        function getDatesInRange(startDate, endDate) {
            const date = new Date(startDate);
            const end = new Date(endDate);
            const dates = [];
            date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
            end.setMinutes(end.getMinutes() + end.getTimezoneOffset());
            while (date <= end) {
                dates.push(new Date(date).toISOString().split('T')[0]);
                date.setDate(date.getDate() + 1);
            }
            return dates;
        }

        function obterPeriodoSelecionado() {
            const dataIni = document.getElementById('dataInicio').value;
            const dataFim = document.getElementById('dataFim').value;
            const horaIni = document.getElementById('horaInicio').value || "00:00";
            const horaFim = document.getElementById('horaFim').value || "23:59";

            if (!dataIni || !dataFim) {
                alert("Selecione as datas para baixar o CSV.");
                return null;
            }

            const dias = getDatesInRange(dataIni, dataFim);
            const limites = dias.map((diaISO) => {
                const inicio = new Date(`${diaISO}T${horaIni}:00`);
                const fim = new Date(`${diaISO}T${horaFim}:59`);
                if (horaIni > horaFim) fim.setDate(fim.getDate() + 1);
                return { diaISO, diaBR: formatarDataBR(diaISO), inicio, fim };
            });

            return { dataIni, dataFim, horaIni, horaFim, dias, limites };
        }

        function horaParaMinutos(valor) {
            const match = String(valor || "").match(/(\d{1,2}):(\d{2})/);
            if (!match) return null;
            return (Number(match[1]) * 60) + Number(match[2]);
        }

        function minutoDentroDoIntervalo(registro, inicio, fim) {
            if (registro === null || inicio === null || fim === null) return false;
            if (inicio <= fim) return registro >= inicio && registro <= fim;
            return registro >= inicio || registro <= fim;
        }

        function registroDentroDoIntervaloDeHoras(horaRegistro, horaIni, horaFim) {
            const registro = horaParaMinutos(horaRegistro);
            const inicio = horaParaMinutos(horaIni);
            const fim = horaParaMinutos(horaFim);

            return minutoDentroDoIntervalo(registro, inicio, fim);
        }

        function registroAgenteDentroDoIntervalo(registro, horaIni, horaFim) {
            const inicioFiltro = horaParaMinutos(horaIni);
            let fimFiltro = horaParaMinutos(horaFim);
            let inicioRegistro = horaParaMinutos(registro.horaInicio);
            let fimRegistro = horaParaMinutos(registro.horaFim);

            if (inicioFiltro === null || fimFiltro === null || inicioRegistro === null) return false;
            if (fimRegistro === null) fimRegistro = inicioRegistro;

            if (fimFiltro < inicioFiltro) fimFiltro += 24 * 60;
            if (fimRegistro < inicioRegistro) fimRegistro += 24 * 60;
            if (inicioRegistro < inicioFiltro && fimFiltro >= 24 * 60) inicioRegistro += 24 * 60;

            return inicioRegistro >= inicioFiltro && fimRegistro <= fimFiltro;
        }

        function filtrarAgentesPorIntervalo(registros, horaIni, horaFim) {
            return registros.filter((registro) => registroAgenteDentroDoIntervalo(registro, horaIni, horaFim));
        }

        function escaparCsv(valor) {
            return `"${String(valor ?? "-").replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
        }

        function baixarCsv(nomeArquivo, linhas) {
            const blob = new Blob([linhas.join("\n")], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = nomeArquivo;
            link.click();
            URL.revokeObjectURL(link.href);
        }

        function formatarPeriodoArquivo(periodo) {
            return `${periodo.dataIni}_a_${periodo.dataFim}`.replace(/[^\d_a-]/g, "-");
        }

        function lerTabelaHTML(idTabela) {
            const tabela = document.getElementById(idTabela);
            if (!tabela) return [];
            const dados = [];
            for (let i = 1; i < tabela.rows.length; i++) {
                const linha = tabela.rows[i];
                if (linha.cells.length < 2) continue;
                const linhaDados = [];
                for (let j = 0; j < linha.cells.length; j++) {
                    linhaDados.push(linha.cells[j].innerText);
                }
                if (!linhaDados.join(" ").includes("(Sem registros")) {
                    dados.push(linhaDados);
                }
            }
            return dados;
        }

        function verificarPreviewCarregado() {
            const container = document.getElementById('previewContainer');
            if (!container || container.style.display === 'none' || !container.querySelector('table')) {
                alert("Clique primeiro em '1º CARREGAR DADOS' para organizar a planilha antes de gerar o PDF.");
                return false;
            }
            return true;
        }

        function aplicarCabecalhoPdf(doc, titulo, dataTexto, horaIni, horaFim) {
            const larguraPagina = doc.internal.pageSize.width;
            doc.setFontSize(14);
            doc.setTextColor(44, 62, 80);
            doc.setFont("helvetica", "bold");
            doc.text(titulo, larguraPagina / 2, 20, { align: "center" });
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.setFont("helvetica", "normal");
            doc.text(`DATA: ${dataTexto} | Período: ${horaIni} às ${horaFim}`, larguraPagina / 2, 32, { align: "center" });
            doc.setDrawColor(200);
            doc.line(14, 38, larguraPagina - 14, 38);
        }

        async function gerarPdfSecao(tipo) {
            if (!verificarPreviewCarregado()) return;

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'mm', 'a4');
            const dataIni = document.getElementById('dataInicio').value;
            const dataFim = document.getElementById('dataFim').value;
            const horaIni = document.getElementById('horaInicio').value || "00:00";
            const horaFim = document.getElementById('horaFim').value || "23:59";
            const dias = getDatesInRange(dataIni, dataFim);
            const isAgentes = tipo === "agentes";

            const titulo = isAgentes
                ? "RELATÓRIO DE AGENTES E FROTA - COTT"
                : "RELATÓRIO DE OCORRÊNCIAS - COTT";
            const prefixoTabela = isAgentes ? "tblAgentes" : "tblOc";
            const nomeSecao = isAgentes ? "CONTROLE DE AGENTES E FROTA" : "OCORRÊNCIAS REGISTRADAS";
            const arquivo = isAgentes ? "Relatorio_Agentes.pdf" : "Relatorio_Ocorrencias.pdf";
            const head = isAgentes
                ? [['VTR', 'AGENTE', 'HT', 'ASE', 'FUNÇÃO', 'MALETAS', 'REGIÃO', 'INÍCIO', 'FIM', 'STATUS', 'BASE']]
                : [['Nº', 'SOLICITANTE', 'OCORRÊNCIA', 'LOCAL', 'REGIÃO', 'EQUIPE', 'ENVIO', 'SITUAÇÃO', 'FIM', 'RESULTADO', 'HISTÓRICO']];
            const headColor = isAgentes ? [41, 128, 185] : [142, 68, 173];

            for (const [index, dia] of dias.entries()) {
                if (index > 0) doc.addPage();
                aplicarCabecalhoPdf(doc, titulo, formatarDataBR(dia), horaIni, horaFim);
                await adicionarEmblemaPdf(doc);

                doc.setFontSize(12);
                doc.setTextColor(0);
                doc.setFont("helvetica", "bold");
                doc.text(nomeSecao, 14, 48);

                const dados = lerTabelaHTML(`${prefixoTabela}_${index}`);
                if (dados.length) {
                    doc.autoTable({
                        startY: 53,
                        head,
                        body: dados,
                        theme: 'grid',
                        headStyles: { fillColor: headColor },
                        styles: { fontSize: 6, cellPadding: 1, overflow: 'linebreak' },
                        columnStyles: isAgentes
                            ? { 1: { cellWidth: 45 }, 10: { cellWidth: 'auto' } }
                            : { 0: { cellWidth: 9 }, 3: { cellWidth: 50 }, 10: { cellWidth: 'auto' } },
                        margin: { bottom: 26 }
                    });
                } else {
                    doc.setFontSize(10);
                    doc.setFont("helvetica", "normal");
                    doc.text("(Sem registros no horário selecionado)", 14, 58);
                }
            }

            doc.save(arquivo);
        }

        document.getElementById('btnGerarPdfAgentes')?.addEventListener('click', () => gerarPdfSecao("agentes"));
        document.getElementById('btnGerarPdfOcorrencias')?.addEventListener('click', () => gerarPdfSecao("ocorrencias"));
        document.querySelectorAll('[data-download-target]').forEach((button) => {
            button.addEventListener('click', () => {
                document.getElementById(button.dataset.downloadTarget)?.click();
            });
        });

        document.getElementById('btnCsvAgentes').onclick = async () => {
            const periodo = obterPeriodoSelecionado();
            if (!periodo) return;

            const linhas = ["\ufeffDATA,VEÍCULO,AGENTE,HT,ASE,FUNÇÃO,MALETAS,REGIÃO,HORA INÍCIO,HORA FIM,TIPO,PONTO BASE"];
            document.getElementById('msgLoading').style.display = 'block';
            document.getElementById('msgLoading').innerText = "Gerando CSV de agentes...";

            try {
                for (const limite of periodo.limites) {
                    const qHistorico = query(collection(db, "historico_agentes"), where("dataRelatorio", "==", limite.diaBR));
                    const qAtivos = query(collection(db, "ativos_agentes"), where("dataRelatorio", "==", limite.diaBR));
                    const snapHistorico = await getDocs(qHistorico);
                    const snapAtivos = await getDocs(qAtivos);

                    const registros = [];
                    snapHistorico.forEach((docSnap) => registros.push({ ...docSnap.data(), statusFinal: docSnap.data().tipo || "ENCERRADO" }));
                    snapAtivos.forEach((docSnap) => registros.push({ ...docSnap.data(), statusFinal: "ATIVO", horaFim: "EM ANDAMENTO" }));

                    const registrosFiltrados = filtrarAgentesPorIntervalo(registros, periodo.horaIni, periodo.horaFim);
                    registrosFiltrados.sort((a, b) => String(a.horaInicio || "23:59").localeCompare(String(b.horaInicio || "23:59")));
                    registrosFiltrados.forEach((a) => {
                        linhas.push([
                            limite.diaBR,
                            a.veiculo,
                            String(a.agente || "").replace(/\n/g, " | "),
                            a.ht,
                            a.ase,
                            a.situacao,
                            a.maletas,
                            a.zona,
                            a.horaInicio,
                            a.horaFim || "-",
                            a.statusFinal,
                            a.pontoBase
                        ].map(escaparCsv).join(","));
                    });
                }

                baixarCsv(`agentes_sttu_${formatarPeriodoArquivo(periodo)}.csv`, linhas);
            } catch (error) {
                console.error(error);
                alert("Erro ao gerar CSV de agentes: " + error.message);
            } finally {
                document.getElementById('msgLoading').style.display = 'none';
            }
        };

        document.getElementById('btnCsvOcorrencias').onclick = async () => {
            const periodo = obterPeriodoSelecionado();
            if (!periodo) return;

            const linhas = ["\ufeffNº,SOLICITANTE,CONTATO,OCORRÊNCIA,LOCAL,DETALHE,REGIÃO,EQUIPE,ENVIO,SITUAÇÃO,FINAL,RESULTADO,HISTÓRICO"];
            document.getElementById('msgLoading').style.display = 'block';
            document.getElementById('msgLoading').innerText = "Gerando CSV de ocorrências...";

            try {
                const qOcorrencias = query(collection(db, "ocorrencias_sttu"), orderBy("timestamp", "asc"));
                const snapOcorrencias = await getDocs(qOcorrencias);

                snapOcorrencias.forEach((docSnap) => {
                    const o = docSnap.data();
                    if (!o.timestamp) return;

                    const dataDoc = o.timestamp.toDate();
                    const dentroDoPeriodo = periodo.limites.some((limite) => dataDoc >= limite.inicio && dataDoc <= limite.fim);
                    if (!dentroDoPeriodo) return;

                    let historico = "";
                    if (o.horaEnvio) historico += `[${o.horaEnvio}] Registro Inicial`;
                    if (Array.isArray(o.historicoLogs) && o.historicoLogs.length) {
                        historico += historico ? " | " : "";
                        historico += o.historicoLogs.map((linha) => String(linha).replace(/\r?\n/g, " ")).join(" | ");
                    }

                    linhas.push([
                        o.numRegistro,
                        o.solicitante,
                        o.contato,
                        o.ocorrencia,
                        o.local,
                        o.detalhamento,
                        o.zona,
                        o.equipe,
                        o.horaEnvio,
                        o.situacao,
                        o.horaFinal || "-",
                        o.resultadoFinal || "-",
                        historico || "-"
                    ].map(escaparCsv).join(","));
                });

                baixarCsv(`ocorrencias_sttu_${formatarPeriodoArquivo(periodo)}.csv`, linhas);
            } catch (error) {
                console.error(error);
                alert("Erro ao gerar CSV de ocorrências: " + error.message);
            } finally {
                document.getElementById('msgLoading').style.display = 'none';
            }
        };

        // --- FUNÇÃO 1: CARREGAR DADOS NA TELA (HTML) ---
        document.getElementById('btnCarregar').onclick = async () => {
            const dataIni = document.getElementById('dataInicio').value;
            const dataFim = document.getElementById('dataFim').value;
            
            // Campos de hora
            const horaIni = document.getElementById('horaInicio').value || "00:00";
            const horaFim = document.getElementById('horaFim').value || "23:59";

            const container = document.getElementById('previewContainer');
            
            if(!dataIni || !dataFim) return alert("Selecione as datas.");
            
            document.getElementById('msgLoading').style.display = 'block';
            container.innerHTML = ""; // Limpa anterior
            container.style.display = 'none';
            document.getElementById('btnGerarPDF').style.display = 'none';

            const diasParaProcessar = getDatesInRange(dataIni, dataFim);

            try {
                const [snapTodasOcorrencias, snapTodasObs] = await Promise.all([
                    getDocs(query(collection(db, "ocorrencias_sttu"), orderBy("timestamp", "asc"))),
                    getDocs(query(collection(db, "observacoes_sttu"), orderBy("timestamp", "asc")))
                ]);

                const todasOcorrencias = [];
                snapTodasOcorrencias.forEach(doc => todasOcorrencias.push(doc.data()));

                const todasObservacoes = [];
                snapTodasObs.forEach(doc => todasObservacoes.push(doc.data()));

                for (let i = 0; i < diasParaProcessar.length; i++) {
                    const diaAtualISO = diasParaProcessar[i];
                    const diaAtualBR = formatarDataBR(diaAtualISO);
                    
                    const divDia = document.createElement('div');
                    divDia.innerHTML = `<h2 style="text-align:center; border-bottom: 2px solid #333; margin-top:40px;">DATA: ${diaAtualBR}</h2>`;
                    
                    // --- NOVA LÓGICA DE LIMITES DIÁRIOS E MADRUGADA ---
                    const limiteInicioDia = new Date(`${diaAtualISO}T${horaIni}:00`);
                    let limiteFimDia = new Date(`${diaAtualISO}T${horaFim}:59`);
                    
                    // Se a hora final for menor que a inicial, soma 1 dia (virou a madrugada)
                    if (horaIni > horaFim) {
                        limiteFimDia.setDate(limiteFimDia.getDate() + 1);
                    }

                    // --- BUSCA DADOS (EM ORDEM CRESCENTE) ---
                    const listaOcorrencias = [];
                    todasOcorrencias.forEach(d => {
                        if(d.timestamp) {
                            const dataDoc = d.timestamp.toDate();
                            // Filtro com os novos limites
                            if(dataDoc >= limiteInicioDia && dataDoc <= limiteFimDia) {
                                listaOcorrencias.push(d);
                            }
                        }
                    });

                    // Agentes (Filtrados apenas pela Data, pois representam o plantão do dia)
                    const qAgentes = query(collection(db, "historico_agentes"), where("dataRelatorio", "==", diaAtualBR));
                    const qAgentesAtivos = query(collection(db, "ativos_agentes"), where("dataRelatorio", "==", diaAtualBR));
                    const snapAgentes = await getDocs(qAgentes);
                    const snapAgentesAtivos = await getDocs(qAgentesAtivos);
                    let listaAgentes = [];
                    snapAgentes.forEach(doc => listaAgentes.push({ ...doc.data(), statusFinal: doc.data().tipo || "ENCERRADO" }));
                    snapAgentesAtivos.forEach(doc => listaAgentes.push({ ...doc.data(), statusFinal: "EM OPERAÇÃO" }));
                    listaAgentes = filtrarAgentesPorIntervalo(listaAgentes, horaIni, horaFim);
                    
                    // Ordenando agentes pela hora de início
                    listaAgentes.sort((a, b) => {
                        const horaA = a.horaInicio || "23:59";
                        const horaB = b.horaInicio || "23:59";
                        return horaA.localeCompare(horaB);
                    });

                    // Observações (EM ORDEM CRESCENTE)
                    const listaObs = [];
                    todasObservacoes.forEach(d => {
                        if(d.timestamp) {
                            const dataDoc = d.timestamp.toDate();
                            // Filtro com os novos limites
                            if(dataDoc >= limiteInicioDia && dataDoc <= limiteFimDia) {
                                listaObs.push(d);
                            }
                        }
                    });

                    // --- RENDERIZA TABELAS HTML ---
                    
                    // 1. AGENTES
                    let htmlAgentes = `
                        <div class="titulo-secao">1. CONTROLE DE AGENTES E FROTA</div>
                        <table class="tabela-preview" id="tblAgentes_${i}">
                            <thead>
                                <tr>
                                    <th>VEÍCULO</th><th>AGENTE</th><th>HT</th><th>ASE</th><th>FUNÇÃO</th>
                                    <th>MALETAS</th><th>REGIÃO</th><th>INÍCIO</th><th>FIM</th><th>STATUS</th><th>PONTO BASE</th>
                                </tr>
                            </thead>
                            <tbody>`;
                    
                    if (listaAgentes.length === 0) htmlAgentes += `<tr><td colspan="11" style="text-align:center;">(Sem registros)</td></tr>`;
                    
                    listaAgentes.forEach(a => {
                        htmlAgentes += `<tr>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${a.veiculo || '-'}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${a.agente ? a.agente.replace(/\n/g, ", ") : '-'}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${a.ht || '-'}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${a.ase || '-'}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${a.situacao || '-'}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${a.maletas || '-'}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${a.zona || '-'}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${a.horaInicio || '-'}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${a.horaFim || '-'}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${a.statusFinal}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${a.pontoBase || '-'}</td>
                        </tr>`;
                    });
                    htmlAgentes += `</tbody></table>`;
                    divDia.innerHTML += htmlAgentes;

                    // 2. OCORRÊNCIAS
                    let htmlOc = `
                        <div class="titulo-secao">2. OCORRÊNCIAS REGISTRADAS</div>
                        <table class="tabela-preview" id="tblOc_${i}">
                            <thead>
                                <tr>
                                    <th>Nº</th><th>SOLICITANTE</th><th>OCORRÊNCIA</th><th>LOCAL/DETALHE</th>
                                    <th>REGIÃO</th><th>EQUIPE</th><th>ENVIO</th><th>SITUAÇÃO</th><th>FIM</th>
                                    <th>RESULTADO</th><th>HISTÓRICO</th>
                                </tr>
                            </thead>
                            <tbody>`;

                    if (listaOcorrencias.length === 0) htmlOc += `<tr><td colspan="11" style="text-align:center;">(Sem registros no horário selecionado)</td></tr>`;

                    listaOcorrencias.forEach(o => {
                        let hist = "";
                        if(o.horaEnvio) hist += `[${o.horaEnvio}] Registro Inicial\n`;
                        if (o.historicoLogs && Array.isArray(o.historicoLogs)) {
                            hist += o.historicoLogs.map(l => String(l).replace(/[^\x20-\x7E\xA0-\xFF]/g, "")).join("\n");
                        }
                        if(!hist) hist = "-";

                        htmlOc += `<tr>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${o.numRegistro || '-'}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${o.solicitante}<br>${o.contato}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${o.ocorrencia}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${o.local}<br>(${o.detalhamento})</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${o.zona}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${o.equipe}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${o.horaEnvio}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${o.situacao}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${o.horaFinal || '-'}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${o.resultadoFinal || '-'}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''} style="white-space: pre-wrap;">${hist}</td>
                        </tr>`;
                    });
                    htmlOc += `</tbody></table>`;
                    divDia.innerHTML += htmlOc;

                    // 3. OBSERVAÇÕES
                    let htmlObs = `
                        <div class="titulo-secao">3. LIVRO DE PLANTÃO</div>
                        <table class="tabela-preview" id="tblObs_${i}">
                            <thead><tr><th style="width:15%">HORA</th><th>DESCRIÇÃO</th></tr></thead>
                            <tbody>`;
                    
                    if (listaObs.length === 0) htmlObs += `<tr><td colspan="2" style="text-align:center;">(Sem registros no horário selecionado)</td></tr>`;

                    listaObs.forEach(obs => {
                        const hora = new Date(obs.timestamp.seconds * 1000).toLocaleTimeString('pt-BR');
                        htmlObs += `<tr>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${hora}</td>
                            <td ${isAdmin ? 'contenteditable="true" class="editavel"' : ''}>${obs.texto}</td>
                        </tr>`;
                    });
                    htmlObs += `</tbody></table>`;
                    divDia.innerHTML += htmlObs;

                    container.appendChild(divDia);
                }

                container.style.display = 'block';
                document.getElementById('btnGerarPDF').style.display = 'inline-block';
                document.getElementById('areaEmail').style.display = 'block';

            } catch (error) {
                console.error(error);
                alert("Erro: " + error.message);
            } finally {
                document.getElementById('msgLoading').style.display = 'none';
            }
        };

        // --- FUNÇÃO 2: GERAR PDF A PARTIR DA TELA (COM AS EDIÇÕES) ---
        document.getElementById('btnGerarPDF').onclick = async () => {
            if (!verificarPreviewCarregado()) return;

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'mm', 'a4');
            const dataIni = document.getElementById('dataInicio').value;
            const dataFim = document.getElementById('dataFim').value;
            const horaIni = document.getElementById('horaInicio').value || "00:00";
            const horaFim = document.getElementById('horaFim').value || "23:59";
            
            const dias = getDatesInRange(dataIni, dataFim);

            document.getElementById('msgLoading').style.display = 'block';
            document.getElementById('msgLoading').innerText = "Gerando PDF com suas edições...";

            let paginaAtual = 1;

            for (let i = 0; i < dias.length; i++) {
                if (i > 0) { doc.addPage(); paginaAtual++; }

                await adicionarEmblemaPdf(doc, 14, 10, 25, 25);
                
                const larguraPagina = doc.internal.pageSize.width;
                doc.setFontSize(14); doc.setTextColor(44, 62, 80); doc.setFont("helvetica", "bold");
                doc.text("CENTRAL DE OPERAÇÕES DE TRÂNSITO E TRANSPORTE - COTT", larguraPagina / 2, 20, { align: "center" });
                
                doc.setFontSize(10); doc.setTextColor(100); doc.setFont("helvetica", "normal");
                // Adicionando a informação do horário no cabeçalho do PDF
                doc.text(`DATA: ${formatarDataBR(dias[i])} | Período: ${horaIni} às ${horaFim}`, larguraPagina / 2, 32, { align: "center" });
                doc.setDrawColor(200); doc.line(14, 38, larguraPagina - 14, 38); 

                let finalY = 45;

                // 1. AGENTES
                doc.setFontSize(12); doc.setTextColor(0); doc.setFont("helvetica", "bold");
                doc.text("1. CONTROLE DE AGENTES E FROTA", 14, finalY); finalY += 5;
                const dadosAgentes = lerTabelaHTML(`tblAgentes_${i}`);
                
                if (dadosAgentes.length > 0) {
                    doc.autoTable({
                        startY: finalY,
                        head: [['VTR', 'AGENTE', 'HT', 'ASE', 'FUNÇÃO', 'MALETAS', 'REGIÃO', 'INÍCIO', 'FIM', 'STATUS', 'BASE']],
                        body: dadosAgentes,
                        theme: 'grid',
                        headStyles: { fillColor: [52, 73, 94] },
                        styles: { fontSize: 6, cellPadding: 1 },
                        columnStyles: { 1: { cellWidth: 40 }, 10: { cellWidth: 'auto' } },
                        margin: { bottom: 40 }
                    });
                    finalY = doc.lastAutoTable.finalY + 15;
                } else {
                    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text("(Sem registros)", 14, finalY + 5); finalY += 15;
                }

                // 2. OCORRÊNCIAS
                doc.setFontSize(12); doc.setFont("helvetica", "bold");
                doc.text("2. OCORRÊNCIAS REGISTRADAS", 14, finalY); finalY += 5;
                const dadosOc = lerTabelaHTML(`tblOc_${i}`);

                if (dadosOc.length > 0) {
                    doc.autoTable({
                        startY: finalY,
                        head: [['Nº', 'SOLICITANTE', 'OCORRÊNCIA', 'LOCAL', 'REGIÃO', 'EQUIPE', 'ENVIO', 'SITUAÇÃO', 'FIM', 'RESULTADO', 'HISTÓRICO']],
                        body: dadosOc,
                        theme: 'grid',
                        headStyles: { fillColor: [192, 57, 43] },
                        styles: { fontSize: 6, cellPadding: 1, overflow: 'linebreak' },
                        columnStyles: { 0: { cellWidth: 8 }, 10: { cellWidth: 'auto' } },
                        margin: { bottom: 40 }
                    });
                    finalY = doc.lastAutoTable.finalY + 15;
                } else {
                    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text("(Sem registros no horário selecionado)", 14, finalY + 5); finalY += 15;
                }

                const pageHeight = doc.internal.pageSize.height;
                if (finalY > pageHeight - 60) { doc.addPage(); finalY = 40; }

                // 3. OBSERVAÇÕES
                doc.setFontSize(12); doc.setFont("helvetica", "bold");
                doc.text("3. LIVRO DE PLANTÃO", 14, finalY); finalY += 5;
                const dadosObs = lerTabelaHTML(`tblObs_${i}`);

                if (dadosObs.length > 0) {
                    doc.autoTable({
                        startY: finalY,
                        head: [['HORA', 'DESCRIÇÃO']],
                        body: dadosObs,
                        theme: 'striped',
                        headStyles: { fillColor: [127, 140, 141] },
                        columnStyles: { 0: { cellWidth: 20 } },
                        styles: { fontSize: 7 },
                        margin: { bottom: 40 }
                    });
                } else {
                    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text("(Sem registros no horário selecionado)", 14, finalY + 5);
                }

                // Rodapé
                doc.line(14, pageHeight - 25, larguraPagina - 14, pageHeight - 25);
                doc.setFontSize(8);
                doc.text("Carmozina Régia de Melo Dantas", 14, pageHeight - 20);
                doc.text("Responsável pelo setor de atendimento", 14, pageHeight - 16);
                doc.text("Kleber Silvestre Lustosa", larguraPagina - 14, pageHeight - 20, { align: 'right' });
                doc.text("Inspetor da COTT", larguraPagina - 14, pageHeight - 16, { align: 'right' });
            }

            document.getElementById('msgLoading').style.display = 'none';
            doc.save("Relatorio_Geral.pdf");
        };
}

iniciarRelatorioGeral().catch((error) => {
    console.error("Erro ao carregar relatorio_geral:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexão e atualize a página.");
});


