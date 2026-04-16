const executarRpa = require('./rpa');

const tarefaFake = {
  paciente_nome: "TESTE PACIENTE",
  empresa: "000000",
  matricula: "0740197",
  dep: "00",
  crm: "521146424",
  nome_medico: "SERGIO EDUARDO MAGALHÃES DIAS ",
  tuss1: "30101012",
  terapia: "Fono"
};

executarRpa(tarefaFake).catch(err => {
  console.error("ERRO CAPTURADO:", err);
});