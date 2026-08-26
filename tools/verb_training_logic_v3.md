# Verb trainer v3 — логика данных и фильтров

## Что изменилось

1. В `verbs_compact_common_n5_n3_v3.csv` поле `значение_ru` теперь содержит **только одно основное значение**.
   Старое полное значение сохранено в `значение_ru_all`, дополнительные смыслы — в `значение_ru_доп`.
   Все русские слоты `ru_*` также приведены к одному выбранному смыслу.

2. Нельзя механически тренировать каждую производную форму на каждом глаголе.
   Для этого в verb CSV добавлены:
   - `train_potential`
   - `train_passive`
   - `train_passive_context`
   - `train_causative`
   - `train_causative_passive`
   - `train_imperative`
   - `train_volitional`
   - `train_desire`
   - `train_benefactive`
   - `train_request`
   - `train_advice`
   - `train_toki`

   Rules CSV содержит `verb_gate_column`. Перед созданием задания движок проверяет соответствующую колонку у глагола.

3. Пассив:
   - `passive_naturalness=natural` — можно давать в обычном пассивном тренажёре.
   - `contextual` — форма грамматически возможна, но без контекста русский prompt часто неоднозначен; в обычный random не включать.
   - `exclude` — не давать как standalone-задание.
   - `ru_passive_prompt` содержит естественный prompt там, где он безопасен.
   - больше нельзя показывать шаблон `быть подвергнутым действию «X»`.

4. Rules CSV использует новые prompt-поля:
   - `ru_prompt_strategy_v3`
   - `ru_prompt_verb_slot_v3`
   - `ru_prompt_template_v3`
   - `ru_prompt_alt_template_v3`

   Код должен предпочитать v3-поля старым.

## Новые правила

Добавлены:
- `te_ageru` — 〜てあげる
- `te_kureru` — 〜てくれる
- `te_morau` — 〜てもらう
- `te_moraemasenka` — 〜てもらえませんか
- `tara_ii_desu_ka` — 〜たらいいですか
- `tara_dou_desu_ka` — 〜たらどうですか
- `toki_nonpast` — Vる + とき
- `toki_past` — Vた + とき
- `toki_negative` — Vない + とき

## Фильтры упражнений

Rules CSV содержит:
- `filter_form_tags` — морфологические/грамматические семейства;
- `filter_semantic_tags` — смысловые модификаторы;
- `filter_register_tags`;
- `filter_question`;
- `filter_default_pool`.

UI-каталог фильтров лежит в `verb_exercise_filters_v3_ru.csv`.

### Пример

Если пользователь выбирает:

- `て-форма`
- `Отрицания`

то сначала ищем правила, где одновременно:

```text
filter_form_tags contains te_form
AND
filter_semantic_tags contains negative
```

Это даст, например, `negative_te`, отрицательные производные `〜ている` и другие реальные пересечения.

`〜てもらえませんか` формально содержит `ません`, но **семантически является просьбой**, поэтому `negative` в `filter_semantic_tags` у него нет.

### Алгоритм exact → fallback

Для каждого набора выбранных form-фильтров + modifier-фильтров:

1. Собрать `exactMatches`: правила, удовлетворяющие выбранной форме и всем применимым semantic modifiers.
2. Если `exactMatches` не пуст — использовать их как основной пул.
3. Если пересечения нет:
   - не обнулять упражнение;
   - добавить правила выбранной form-family в общий пул;
   - отдельно добавить правила выбранных modifiers из общего trainable pool.
4. Удалить дубликаты по `form_id`.
5. Применить `verb_gate_column` к выбранному глаголу.
6. Удалить `filter_default_pool=0`, если пользователь явно не включил rare/advanced режим.

Так фильтры **мэтчатся там, где реальное пересечение существует**, а несовместимые комбинации не приводят к пустому упражнению.

## Режим B

Поля `accepted_alternative_grammar_ids`, `requires_explicit_grammar_hint`,
`allow_multiple_correct_answers`, `mode_b_enabled` сохранены.

При meaning-only задании:
- разрешённые `grammar_id` берутся из текущего `grammar_id` + `accepted_alternative_grammar_ids`;
- проверка идёт через resolver атомарных chunks;
- если нужен конкретный паттерн, использовать Mode A и показывать `grammar_label_ru`.

## Одно значение глагола

UI и генератор должны использовать:

```text
значение_ru
ru_inf_ipf
ru_inf_pf
...
```

Не использовать `значение_ru_all` и `*_all` для формулировки задания.
Они оставлены только для справки/словаря.

Если позже нужен полноценный многозначный словарь, дополнительные значения следует оформлять отдельным sense-layer, а не склеивать через `/` в тренировочном prompt.
