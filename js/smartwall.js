async function iniciarSmartwall() {
    const {initializeApp} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const {getAuth, onAuthStateChanged} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");

// 👇 IMPORTAÇÃO DO AUTH ADICIONADA AQUI 👇
    const {getFirestore, collection, query, onSnapshot, where} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");const firebaseConfig = {
            apiKey: "AIzaSyCjiEzdahcQqKS9V1Py4nAIx15Zqr9nIIo",
            authDomain: "sttu-registros.firebaseapp.com",
            projectId: "sttu-registros",
            storageBucket: "sttu-registros.firebasestorage.app",
            messagingSenderId: "785219239564",
            appId: "1:785219239564:web:4b8175a8d7ccceba06c5a9",
            measurementId: "G-C7PSE7YFRG"
        };

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app); // 👇 INICIALIZAÇÃO DO AUTH AQUI 👇
        const db = getFirestore(app);

        // Relógio
        setInterval(() => {
            document.getElementById('relogio').innerText = new Date().toLocaleTimeString('pt-BR');
        }, 1000);

        function getDataHojeISO() {
            const hoje = new Date();
            return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
        }
        const dataFiltro = getDataHojeISO();

        let myChartRegioes = null;
        let myChartTipos = null;
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Segoe UI', sans-serif";

        function calcularTempoAberto(horaEnvio) {
            if (!horaEnvio || !horaEnvio.includes(':')) return 'Tempo desconhecido';
            
            const agora = new Date();
            const [horas, minutos] = horaEnvio.split(':').map(Number);
            
            let envio = new Date();
            envio.setHours(horas, minutos, 0, 0);

            let diffMs = agora - envio;
            if (diffMs < 0) {
                envio.setDate(envio.getDate() - 1);
                diffMs = agora - envio;
            }

            const diffMinutos = Math.floor(diffMs / 60000);
            const h = Math.floor(diffMinutos / 60);
            const m = diffMinutos % 60;

            if (h > 0) return `⏳ Aberta há ${h}h e ${m}m`;
            return `⏳ Aberta há ${m} minutos`;
        }

        function atualizarDashboard(docsHoje, docsPendentes) {
            const mapaUnico = new Map();
            docsPendentes.forEach(d => mapaUnico.set(d.id, d));
            docsHoje.forEach(d => mapaUnico.set(d.id, d));
            const todas = Array.from(mapaUnico.values());
            
            let totalHoje = 0;
            let concluidasHoje = 0;
            let ativas = [];
            let vtrsEmpenhadas = new Set();
            let contagemRegiao = { "REGIÃO 1": 0, "REGIÃO 2": 0, "REGIÃO 3": 0, "REGIÃO 4": 0, "REGIÃO 5": 0 };
            let contagemTipo = {};

            todas.forEach(d => {
                const isHoje = d.data_filtro === dataFiltro;
                const isPendente = ["ENCAMINHADA", "NÃO ATENDIDA", "PARA O DESPACHO", "PARA O PRÓXIMO TURNO"].includes(d.situacao);

                if (isHoje) {
                    totalHoje++;
                    if (d.situacao === 'CONCLUÍDA') concluidasHoje++;
                    let tipoBase = d.ocorrencia.split(' (')[0];
                    contagemTipo[tipoBase] = (contagemTipo[tipoBase] || 0) + 1;
                }

                if (isPendente) {
                    ativas.push(d);
                    if (d.situacao === 'ENCAMINHADA' && d.equipe) {
                        d.equipe.split(',').forEach(eq => vtrsEmpenhadas.add(eq.trim()));
                    }
                    if (d.zona && contagemRegiao[d.zona.toUpperCase()] !== undefined) {
                        contagemRegiao[d.zona.toUpperCase()]++;
                    }
                }
            });

            document.getElementById('kpiTotal').innerText = totalHoje;
            document.getElementById('kpiAndamento').innerText = ativas.length;
            document.getElementById('kpiConcluidas').innerText = concluidasHoje;
            document.getElementById('kpiVtrs').innerText = vtrsEmpenhadas.size;

            const cardVtrs = document.getElementById('kpiVtrsCard');
            if (vtrsEmpenhadas.size > 0) {
                let arrayVtrs = Array.from(vtrsEmpenhadas).sort();
                let tooltipText = "EQUIPES EM ATENDIMENTO:\n\n";
                for (let i = 0; i < arrayVtrs.length; i++) {
                    tooltipText += arrayVtrs[i] + ((i + 1) % 4 === 0 ? '\n' : ' | ');
                }
                if(tooltipText.endsWith(' | ')) tooltipText = tooltipText.slice(0, -3);
                cardVtrs.setAttribute('data-tooltip', tooltipText);
            } else {
                cardVtrs.setAttribute('data-tooltip', 'Nenhuma equipe empenhada no momento.');
            }

            ativas.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            const divLista = document.getElementById('listaAtivas');
            divLista.innerHTML = '';
            
            ativas.slice(0, 8).forEach(o => {
                let statusClass = o.situacao === 'PARA O DESPACHO' ? 'despacho' : 
                                  o.situacao === 'NÃO ATENDIDA' ? 'nao-atendida' : '';
                
                let iconStatus = o.situacao === 'PARA O DESPACHO' ? '🔴' : 
                                 o.situacao === 'ENCAMINHADA' ? '🟡' : '⚪';

                let tempoAbertoStr = calcularTempoAberto(o.horaEnvio);
                let tooltipDetalhe = `${tempoAbertoStr}\n\nLocal: ${o.local}\nDetalhe: ${o.detalhamento}`;

                divLista.innerHTML += `
                    <div class="list-item has-tooltip ${statusClass}" data-tooltip="${tooltipDetalhe}">
                        <div class="item-info">
                            <span>${iconStatus}</span>
                            <span class="item-reg">#${o.numRegistro}</span>
                            <span class="item-tipo">${o.ocorrencia}</span>
                            <span class="item-zona">${o.zona}</span>
                        </div>
                        <div style="font-weight:bold; font-size:11px; color: ${statusClass==='despacho'? '#ef4444' : 'var(--accent-blue)'};">
                            ${o.equipe ? '🚓 ' + o.equipe : 'AGUARDANDO VTR'}
                        </div>
                    </div>
                `;
            });

            if(ativas.length === 0) {
                divLista.innerHTML = '<div style="text-align:center; color:#94a3b8; margin-top:20px;">Tranquilidade absoluta. Nenhuma ocorrência.</div>';
            }

            atualizarGraficos(contagemRegiao, contagemTipo);
        }

        function atualizarGraficos(dadosRegiao, dadosTipo) {
            const ctxRegioes = document.getElementById('chartRegioes').getContext('2d');
            if (myChartRegioes) myChartRegioes.destroy();
            
            myChartRegioes = new Chart(ctxRegioes, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(dadosRegiao),
                    datasets: [{
                        data: Object.values(dadosRegiao),
                        backgroundColor: ['#3b364c', '#e4f001', '#64ec02', '#096acc', '#d30000'],
                        borderWidth: 0
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#e2e8f0' } } } }
            });

            const tiposOrdenados = Object.entries(dadosTipo).sort((a, b) => b[1] - a[1]).slice(0, 5);
            const ctxTipos = document.getElementById('chartTipos').getContext('2d');
            if (myChartTipos) myChartTipos.destroy();

            myChartTipos = new Chart(ctxTipos, {
                type: 'bar',
                data: {
                    labels: tiposOrdenados.map(t => t[0]),
                    datasets: [{ label: 'Qtd', data: tiposOrdenados.map(t => t[1]), backgroundColor: '#3b82f6', borderRadius: 4 }]
                },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                    scales: { x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } }, y: { grid: { display: false } } }
                }
            });
        }

        // 👇 VERIFICAÇÃO DE LOGIN ENVOLVENDO A BUSCA DO FIREBASE 👇
        onAuthStateChanged(auth, (user) => {
            if (user) {
                let docsHoje = [];
                let docsPendentes = [];
                const qHoje = query(collection(db, "ocorrencias_sttu"), where("data_filtro", "==", dataFiltro));
                const qPendentes = query(collection(db, "ocorrencias_sttu"), where("situacao", "in", ["ENCAMINHADA", "NÃO ATENDIDA", "PARA O DESPACHO", "PARA O PRÓXIMO TURNO"]));

                onSnapshot(qHoje, (snapshot) => {
                    docsHoje = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    atualizarDashboard(docsHoje, docsPendentes);
                });

                onSnapshot(qPendentes, (snapshot) => {
                    docsPendentes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    atualizarDashboard(docsHoje, docsPendentes);
                });
            } else {
                // Se não estiver logado, joga de volta pro login
                window.location.href = "login.html";
            }
        });
}

iniciarSmartwall().catch((error) => {
    console.error("Erro ao carregar smartwall:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexão e atualize a página.");
});


