/**
 * Ponto de entrada alternativo. start.bat chama worker.js diretamente; este
 * arquivo existe para quem rodar `node .` ou `npm start` na pasta.
 *
 * Delega ao main() do worker de propósito: ele é quem traduz o desfecho em
 * código de saída para o supervisor. A versão anterior chamava iniciarWorker() e
 * descartava o retorno, então o supervisor relançaria o robô até nos casos em
 * que ele deve parar (token revogado, por exemplo).
 */
require('./worker').main()
