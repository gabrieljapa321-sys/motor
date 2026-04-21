# Smoke Test

## Local

1. Suba o servidor com `py -m http.server 8000`.
2. Abra `http://localhost:8000`.
3. Faça `Ctrl+F5` antes de validar a versão nova.

## Fluxo principal

1. Confirme que a tela abre sem aviso amarelo e sem cards vazios no `Painel`.
2. Troque entre `Painel`, `Semana`, `Flashcards`, `Calendário` e `Notas`.
3. Mude o modo para `Exausto`, recarregue e verifique se o modo persiste.
4. Clique em `Exportar`, gere um backup e depois teste `Importar` com o mesmo arquivo.

## Semana

1. Crie uma tarefa nova na inbox.
2. Arraste a tarefa para um dia da semana.
3. Marque como feita e depois edite o texto clicando no conteúdo do card.
4. Troque a densidade entre `Compacto` e `Confortável`.
5. Navegue para semana anterior e próxima.

## Calendário

1. Verifique se os dias usam apenas marcadores discretos no canto superior direito.
2. Confirme que dias passados não mostram rótulos longos.
3. Teste `Anterior`, `Hoje` e `Próximo`.
4. Confira se estudo, prova e entrega aparecem com visual distinto.

## Notas

1. Selecione uma matéria em foco.
2. Ajuste as metas e salve.
3. Lance uma nota nova e depois edite ou remova a entrada.
4. Abra o simulador e aplique um preset.

## Firebase

1. Abra `Conta`.
2. Entre com Google.
3. Confirme se o texto do painel de conta muda para estado autenticado.
4. Atualize a página e verifique se os dados continuam sincronizados.

## Checklist rápido

- Console sem erros vermelhos.
- Navegação sem travar.
- Estado persistindo após reload.
- Importação e exportação funcionando.
- Login e logout funcionando no ambiente publicado.
