/**
 * Digitação com ritmo humano.
 *
 * O portal da ASSIM é sensível a preenchimento instantâneo (campos que
 * dependem de onkeyup/onchange não disparam, e formulário preenchido em zero
 * milissegundo é o padrão mais óbvio de automação). Extraído de rpa.js para ser
 * usado também no login.
 */

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function humanType(page, selector, texto) {
  await page.focus(selector)

  for (let i = 0; i < texto.length; i++) {
    await page.keyboard.type(texto[i])

    let espera = 8 + Math.random() * 20

    if (i % 5 === 0) espera += 40 + Math.random() * 80
    if (texto[i] === ' ') espera += 60

    await page.waitForTimeout(espera)

    if (Math.random() < 0.002 && i > 0) {
      await page.keyboard.press('Backspace')
      await page.keyboard.type(texto[i])
    }
  }
}

module.exports = { delay, humanType }
