Regras que valem para todas as etapas Cole estas regras junto se o Claude Code perder o contexto:

1. Inspecione o schema real antes de escrever SQL. Os nomes de tabelas e colunas nos prompts são uma suposição — confirme com o banco e adapte. Nunca assuma.
2. Nenhuma migração destrutiva. Nada de `drop table`, `drop column` ou `truncate` sem me perguntar antes.
3. Toda alteração de banco vira arquivo de migração versionado em `supabase/migrations/`, com data no nome. Nada de rodar SQL solto que ninguém sabe reproduzir.
4. Nenhum segredo no código. Tudo em variável de ambiente. Nada sensível em `NEXT_PUBLIC_*`.
5. Explique antes de executar quando a mudança afetar dados existentes.
6. Código e comentários em português, seguindo o padrão já existente no projeto.
7. Se encontrar algo pior do que o descrito no prompt, pare e me avise em vez de contornar por conta própria
