// Verificação de propriedade do Google Search Console (método "arquivo HTML").
// O Pages redireciona qualquer `*.html` para o endereço sem a extensão, e a verificação do Google
// pede o endereço exato, sem redirecionamento — por isso o arquivo é servido por uma função, que
// responde 200 direto em /googlecc773369552623fd.html. Não apagar: o Google confere de vez em quando.
export function onRequestGet() {
  return new Response('google-site-verification: googlecc773369552623fd.html', {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}
