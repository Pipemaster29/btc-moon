#!/usr/bin/env bash
#
# Os dados que o robô grava moram na branch `dados`, e não no `main`.
#
# POR QUE. A Vercel publica o site a cada commit no `main`, e o plano gratuito
# cria no máximo 100 deployments por dia — contando os que o `ignoreCommand`
# cancela, porque "só mudou dado" (documentação da Vercel). Medido em 23/09: 74
# commits do robô em 24 horas, três quartos da cota só com retratos, e o merge
# do PR #2 perdeu o deploy por "rate limited". Com os dados numa branch que a
# Vercel não vigia, o `main` só recebe código, e a cota fica para ele.
#
# A página não perde nada: ela já lia os dados do GitHub raw, e não do build
# (armadilha nº 6 do AGENTS.md). Só o endereço muda, em `lib/guardado.ts`.
#
# A branch `dados` é ÓRFÃ: não tem código, só `data/` e um `vercel.json` que
# desliga deploy nela. Órfã de propósito — uma branch com o código junto teria
# de receber merge do `main`, e um push do robô que carregue mudança em
# `.github/workflows/` é recusado ao token do Actions.
#
# O `main` continua guardando o que é gerado À MÃO (`detentores.json`,
# `vesting.json`, `estudos.json`): a página lê esses do disco do build, e um
# commit deles no `main` deve mesmo publicar o site.
#
# Uso:
#   bash scripts/dados.sh baixar           traz os dados vivos para ./data
#   bash scripts/dados.sh gravar "msg"     grava ./data na branch `dados` e envia
#   bash scripts/dados.sh desocupar-main   (workflow) tira os arquivos do robô do main
#   npm run dados                          o mesmo que `baixar`, para uso local

set -euo pipefail

DIR=.dados
# Os arquivos do robô. A mesma lista está no .gitignore do `main` — mudar aqui
# sem mudar lá faria o arquivo novo voltar a ser commitado no `main`.
PADRAO='^(panorama\.json|historico-[0-9]{4}-[0-9]{2}(-[12])?\.jsonl|carteira\.json|garimpo\.json|placar\.json|sinais\.json|fluxo-binance(-resumo)?\.json|fluxo-binance-[0-9]{4}-[0-9]{2}\.jsonl|estudos-em-vista\.json)$'

arquivos_em() {
  # Os arquivos do robô presentes numa pasta, um por linha, só o nome.
  [ -d "$1" ] || return 0
  ls -1 "$1" | grep -E "$PADRAO" || true
}

commitar_e_enviar() {
  local msg="$1"
  git -C "$DIR" add -A data vercel.json 2>/dev/null || git -C "$DIR" add -A data
  if git -C "$DIR" diff --cached --quiet; then
    echo "dados: nada mudou"
    return 0
  fi
  git -C "$DIR" commit --quiet -m "$msg"
  # Um escritor só por vez — o grupo de concorrência do workflow garante —, então
  # push recusado é rede ou corrida rara. O retrato seguinte parte do remoto de
  # novo: perder um é melhor do que forçar por cima.
  if git -C "$DIR" push --quiet origin HEAD:dados; then
    echo "dados: gravado ($msg)"
  else
    # Código de saída diferente de zero: o fechamento do workflow usa isso
    # para tentar de novo do zero, como fazia com o push no `main`.
    echo "dados: push recusado"
    return 1
  fi
}

preparar() {
  local existe=0
  # Refspec explícito: o checkout do Actions é de uma branch só, e um `git fetch
  # origin dados` simples cairia em FETCH_HEAD sem criar `origin/dados` — o
  # segundo retrato da simulação morreu exatamente aí.
  if git fetch --quiet origin +refs/heads/dados:refs/remotes/origin/dados 2>/dev/null; then existe=1; fi

  if [ ! -e "$DIR/.git" ]; then
    if [ "$existe" = 1 ]; then
      git worktree add --quiet --force --detach "$DIR" origin/dados
    else
      # Primeira vez: a branch ainda não existe. Nasce órfã, só com o que
      # a Vercel precisa ler para NÃO publicar.
      git worktree add --quiet --force --detach "$DIR" HEAD
      git -C "$DIR" checkout --quiet --orphan dados-nova
      git -C "$DIR" rm -rf --quiet . 2>/dev/null || true
      find "$DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
      mkdir -p "$DIR/data"
      printf '{\n  "$schema": "https://openapi.vercel.sh/vercel.json",\n  "git": { "deploymentEnabled": false }\n}\n' > "$DIR/vercel.json"
    fi
  elif [ "$existe" = 1 ]; then
    git -C "$DIR" checkout --quiet --detach origin/dados
    git -C "$DIR" reset --quiet --hard origin/dados
  fi
  mkdir -p "$DIR/data"

  importar_do_main
}

# A TRANSIÇÃO, que roda sozinha e uma vez. Até a mudança, o robô commitava no
# `main`; o último desses commits é o dado mais novo que existe. Enquanto a
# ponta de `dados` for uma importação (ou a branch não existir), procura no
# `main` o commit mais recente que ainda tem `data/panorama.json` e, se for
# outro, importa dele. Depois do primeiro retrato gravado aqui, a ponta deixa
# de ser importação e isto não roda mais — nem busca histórico do `main`.
importar_do_main() {
  local ponta
  ponta=$(git -C "$DIR" log -1 --format=%s 2>/dev/null || echo "")
  if [ -n "$ponta" ] && [[ "$ponta" != "Importa do main"* ]]; then return 0; fi

  # O checkout do Actions é raso (um commit). Cinquenta bastam: a mudança
  # apaga os arquivos no `main`, e o commit anterior a ela está logo atrás.
  git fetch --quiet --depth=50 origin +refs/heads/main:refs/remotes/origin/main 2>/dev/null || true
  local ultimo=""
  for c in $(git rev-list --first-parent -n 50 origin/main 2>/dev/null); do
    if git cat-file -e "$c:data/panorama.json" 2>/dev/null; then ultimo=$c; break; fi
  done
  if [ -z "$ultimo" ]; then return 0; fi
  if [[ "$ponta" == *"$ultimo"* ]]; then return 0; fi

  echo "dados: importando do main em ${ultimo:0:7}"
  for f in $(git ls-tree --name-only "$ultimo" data/ | sed 's#^data/##' | grep -E "$PADRAO"); do
    git show "$ultimo:data/$f" > "$DIR/data/$f"
  done
  commitar_e_enviar "Importa do main os dados de $ultimo"
}

# TIRAR OS ARQUIVOS DO ROBÔ DO `main`, uma vez, pelo próprio robô.
#
# Não pode ser o PR que faz isso: o robô commita esses arquivos no `main` a cada
# ~20 minutos, e um PR que os apaga entra em conflito (modificado de um lado,
# apagado do outro) com cada retrato novo — o botão de merge ficaria travado.
# Aqui não há corrida: roda no workflow, que é o único escritor, e só depois de a
# branch `dados` existir no remoto com os dados importados. O `.gitignore` do
# `main` já lista os mesmos arquivos, então eles ficam no disco do runner e não
# voltam a ser commitados.
desocupar_main() {
  git ls-remote --exit-code --heads origin dados >/dev/null 2>&1 || return 0
  # Só tira depois de a importação estar no remoto: sem isso, um push perdido
  # da importação deixaria os dados sem casa nenhuma.
  git fetch --quiet origin +refs/heads/dados:refs/remotes/origin/dados 2>/dev/null || return 0
  git cat-file -e origin/dados:data/panorama.json 2>/dev/null || return 0
  local rastreados
  rastreados=$(git ls-files data/ | sed 's#^data/##' | grep -E "$PADRAO" || true)
  [ -z "$rastreados" ] && return 0
  for f in $rastreados; do git rm --cached --quiet "data/$f"; done
  git commit --quiet -m "Tira do main os dados do robô: moram na branch dados" \
    -m "Uma vez, pelo workflow, depois de a branch dados receber a importação. Ver scripts/dados.sh."
  if git push --quiet origin HEAD:main; then
    echo "dados: arquivos do robô tirados do main"
  else
    # Corrida com alguém empurrando no `main`: desfaz o commit e tenta na
    # próxima execução. Os arquivos continuam no disco.
    git reset --quiet HEAD~1
    echo "dados: não consegui tirar os arquivos do main agora, a próxima execução tenta"
  fi
}

baixar() {
  preparar
  mkdir -p data
  local n=0
  for f in $(arquivos_em "$DIR/data"); do
    cp -f "$DIR/data/$f" "data/$f"
    n=$((n + 1))
  done
  echo "dados: $n arquivo(s) trazidos da branch dados"
}

gravar() {
  local msg="${1:-Retrato do panorama $(date -u +%Y-%m-%dT%H:%MZ)}"
  preparar
  # O FREIO DA OUTRA PONTA (armadilha nº 7). O workflow não roda o robô quando
  # `baixar` falha — mas se um dia rodar, o panorama começaria de um histórico
  # vazio e isto empurraria uma linha por cima de dezenas de milhares. Histórico
  # só cresce: arquivo local com MENOS linhas que o da branch não é gravado.
  local f remoto local_
  for f in $(arquivos_em "$DIR/data" | grep 'jsonl$' || true); do
    [ -f "data/$f" ] || continue
    remoto=$(wc -l < "$DIR/data/$f")
    local_=$(wc -l < "data/$f")
    if [ "$local_" -lt "$remoto" ]; then
      echo "dados: RECUSADO — data/$f tem $local_ linhas e a branch tem $remoto; histórico só cresce" >&2
      return 1
    fi
  done
  for f in $(arquivos_em data); do
    cp -f "data/$f" "$DIR/data/$f"
  done
  commitar_e_enviar "$msg"
}

case "${1:-}" in
  baixar) baixar ;;
  gravar) shift; gravar "${1:-}" ;;
  desocupar-main) desocupar_main ;;
  *) echo "uso: bash scripts/dados.sh baixar | gravar \"mensagem\" | desocupar-main" >&2; exit 2 ;;
esac
