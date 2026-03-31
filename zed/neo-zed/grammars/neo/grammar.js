/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

function sep1(rule, sep) {
  return seq(rule, repeat(seq(sep, rule)));
}

function sep(rule, sep_token) {
  return optional(sep1(rule, sep_token));
}

function commaSep1(rule) {
  return sep1(rule, ',');
}

function commaSep(rule) {
  return optional(commaSep1(rule));
}

const PREC = {
  TERNARY: -1,
  TYPE_ASSERTION: 0,
  LOGICAL_OR: 1,
  LOGICAL_AND: 2,
  BITWISE_OR: 3,
  BITWISE_XOR: 4,
  BITWISE_AND: 5,
  EQUALITY: 6,
  COMPARISON: 7,
  SHIFT: 8,
  ADDITIVE: 9,
  MULTIPLICATIVE: 10,
  EXPONENTIATION: 11,
  NULL_COALESCE: 12,
  RANGE: 13,
  UNARY: 14,
  POSTFIX: 15,
  INIT: 16,
  ELSE_EXPR: -2,
  PAYLOAD: -3,
};

module.exports = grammar({
  name: 'neo',

  extras: $ => [
    /\s/,
    $.line_comment,
    $.block_comment,
  ],

  word: $ => $.identifier,

  supertypes: $ => [
    $._expression,
    $._statement,
    $._literal,
  ],

  inline: $ => [
    $._type_identifier,
    $._top_level_item,
  ],

  conflicts: $ => [
    [$._expression, $._type],
    [$.generic_type, $._expression],
    [$._type, $.block_expression],
    [$._expression, $.block_expression],
    [$.type_assertion_expression, $.compile_time_run],
    [$._expression, $.compile_time_insert],
    [$._type, $.generic_type],
    [$.function_type, $.parameter_list],
    [$._expression, $.struct_field_pattern],
    [$.parameter, $._type],
    [$._function_type_param, $.parameter],
    [$.variable_declaration],
    [$.constant_declaration],
    [$.shorthand_variable_declaration],
    [$.shorthand_constant_declaration],
    [$.while_statement],
    [$.until_statement],
    [$.for_c_statement],
    [$.for_in_statement],
    [$.for_range_statement],
    [$.when_statement],
    [$.typeof_type, $.typeof_expression],
    [$.array_element_pattern, $._expression],
    [$.struct_field_pattern, $.struct_init_field],
    [$.for_c_shorthand_statement],
    [$._expression, $.struct_init_expression],
    [$._expression, $.compile_time_directive],
  ],

  rules: {
    source_file: $ => seq(
      optional($.namespace_declaration),
      repeat($._top_level_item),
    ),

    // =====================================================================
    // TOP-LEVEL ITEMS
    // =====================================================================

    _top_level_item: $ => choice(
      $.function_declaration,
      $.typedef_declaration,
      $.function_overload_declaration,
      $.operator_overload_declaration,
      $.extern_block,
      $.import_statement,
      $.using_declaration,
      $.test_block,
      $._statement,
    ),

    // =====================================================================
    // NAMESPACE & IMPORTS
    // =====================================================================

    namespace_declaration: $ => seq(
      'namespace',
      field('name', $._namespace_path),
      ';',
    ),

    _namespace_path: $ => sep1($.identifier, '::'),

    import_statement: $ => seq(
      '#import',
      $._import_body,
      ';',
    ),

    _import_body: $ => choice(
      // #import extern "header.h" as name
      seq(
        'extern',
        field('header', $.string_literal),
        'as',
        field('alias', $.identifier),
      ),
      // #import { symbols } from path
      seq(
        '{',
        commaSep1($.import_symbol),
        '}',
        optional('from'),
        field('path', $._import_path),
      ),
      // #import using name / #import name as alias / #import a, b from c
      seq(
        commaSep1($.import_item),
        optional(seq('from', field('from', $._import_path))),
      ),
    ),

    _import_path: $ => choice(
      $._namespace_path,
      $.string_literal,
    ),

    import_symbol: $ => seq(
      field('name', $.identifier),
      optional(seq('as', field('alias', $.identifier))),
    ),

    import_item: $ => seq(
      optional('using'),
      field('path', $._import_path),
      optional(seq('as', field('alias', $.identifier))),
    ),

    using_declaration: $ => choice(
      seq('using', field('name', $._qualified_or_identifier), ';'),
      seq(
        'using',
        optional(seq('{', commaSep1($.identifier), '}', 'from')),
        field('source', $._qualified_or_identifier),
        'in',
        field('target', $.identifier),
        ';',
      ),
    ),

    _qualified_or_identifier: $ => choice(
      $.identifier,
      $.qualified_identifier,
    ),

    // =====================================================================
    // DECLARATIONS
    // =====================================================================

    // --- Functions ---

    function_declaration: $ => seq(
      optional($.attribute_list),
      'fn',
      field('name', $.identifier),
      optional($.generic_parameters),
      $.parameter_list,
      optional(seq(':', field('return_type', $._type))),
      optional(choice(
        '#macro',
        seq('#modify', $.block),
      )),
      choice(
        field('body', $.block),
        seq('undefined', ';'),
        ';',
      ),
    ),

    parameter_list: $ => seq(
      '(',
      commaSep($.parameter),
      optional(','),
      ')',
    ),

    parameter: $ => choice(
      seq(
        optional('mut'),
        field('name', $.identifier),
        optional(seq(':', field('type', $._type))),
        optional(seq(choice('=', ':='), field('default', $._expression))),
      ),
      // Variadic: name: ..Type
      seq(
        field('name', $.identifier),
        ':',
        '..',
        field('type', $._type),
      ),
      '#c_varargs',
    ),

    function_overload_declaration: $ => seq(
      optional($.attribute_list),
      'fn',
      field('name', $.identifier),
      'overloads',
      '{',
      commaSep1($.identifier),
      optional(','),
      '}',
    ),

    operator_overload_declaration: $ => seq(
      optional($.attribute_list),
      'operator',
      field('op', $._operator_token),
      'overloads',
      '{',
      commaSep1($.identifier),
      optional(','),
      '}',
    ),

    _operator_token: $ => choice(
      '+', '-', '*', '/', '%', '**',
      '==', '!=', '<', '<=', '>', '>=',
      '<<', '>>', '&', '|', '^', '~',
      '++', '--',
      '[]', '[]=',
    ),

    // --- Typedefs ---

    typedef_declaration: $ => seq(
      optional($.attribute_list),
      'typedef',
      field('name', $._type_identifier),
      choice(
        $.typedef_alias,
        $.struct_definition,
        $.enum_definition,
        $.union_definition,
        $.error_definition,
      ),
    ),

    typedef_alias: $ => seq('as', field('type', $._type), ';'),

    struct_definition: $ => seq(
      'struct',
      optional($.generic_parameters),
      optional(seq(':', 'undefined')),
      '{',
      repeat($._struct_member),
      '}',
    ),

    _struct_member: $ => choice(
      $.struct_field,
      $.embedded_struct,
      $.compile_time_directive,
    ),

    struct_field: $ => seq(
      optional($.attribute_list),
      optional('const'),
      commaSep1(field('name', $.identifier)),
      ':',
      field('type', $._type),
      optional(choice(
        seq('=', field('default', $._expression)),
        seq(':', field('bits', $.number_literal)),
      )),
      ';',
    ),

    embedded_struct: $ => seq('...', field('type', $._type), ';'),

    enum_definition: $ => seq(
      'enum',
      optional(seq(':', field('backing_type', $._type))),
      '{',
      commaSep($.enum_variant),
      optional(','),
      '}',
    ),

    enum_variant: $ => choice(
      seq(
        field('name', $.identifier),
        optional(seq('=', field('value', $._expression))),
      ),
      seq('_', '=', field('value', $._expression)),
    ),

    union_definition: $ => seq(
      'union',
      '{',
      repeat($.struct_field),
      '}',
    ),

    error_definition: $ => seq(
      'error',
      '{',
      commaSep($.error_variant),
      optional(','),
      '}',
    ),

    error_variant: $ => choice(
      seq(
        field('name', $.identifier),
        optional(seq('=', field('value', $._expression))),
      ),
      seq(
        '...',
        field('type', $._type),
        optional(seq('-', '{', commaSep1($.identifier), '}')),
      ),
      seq(
        field('source', $.qualified_identifier),
        'as',
        field('alias', $.identifier),
      ),
    ),

    // --- Extern ---

    extern_block: $ => seq(
      optional($.attribute_list),
      'extern',
      field('library', $.string_literal),
      optional(seq('as', field('alias', $.identifier))),
      choice(
        seq('{', repeat(choice($.function_declaration, $.variable_declaration, $.constant_declaration)), '}'),
        ';',
      ),
    ),

    // =====================================================================
    // GENERICS
    // =====================================================================

    generic_parameters: $ => seq(
      '<',
      commaSep1($.generic_parameter),
      '>',
    ),

    generic_parameter: $ => choice(
      seq('$', field('name', $.identifier)),
      seq('$', field('name', $.identifier), '::', field('constraint', $._type_constraint)),
      seq('$', field('name', $.identifier), ':', field('type', $._type)),
    ),

    _type_constraint: $ => choice(
      $._type,
      $.builtin_constraint,
    ),

    builtin_constraint: $ => choice(
      '#number', '#integer', '#decimal', '#signed',
      '#unsigned', '#signed_integer', '#boolean',
    ),

    generic_arguments: $ => seq(
      '<',
      commaSep1($._type),
      '>',
    ),

    // =====================================================================
    // TYPES
    // =====================================================================

    _type: $ => choice(
      $.primitive_type,
      alias($.identifier, $.type_identifier),
      $.qualified_type,
      $.pointer_type,
      $.array_type,
      $.dynamic_array_type,
      $.inferred_array_type,
      $.slice_type,
      $.multi_pointer_type,
      $.sentinel_pointer_type,
      $.map_type,
      $.ordered_map_type,
      $.tuple_type,
      $.function_type,
      $.generic_type,
      $.generic_parameter_type,
      $.optional_type,
      $.result_type,
      $.union_type,
      $.soa_type,
      $.simd_type,
      $.anonymous_struct_type,
      $.typeof_type,
      $.parenthesized_type,
      $.self_type,
    ),

    _type_identifier: $ => alias($.identifier, $.type_identifier),

    primitive_type: $ => choice(
      'int', 'uint', 'float', 'double',
      'byte', 'u8', 'u16', 'u32', 'u64', 'u128',
      's8', 's16', 's32', 's64', 's128',
      'f16', 'f32', 'f64', 'f128',
      'bool', 'b8', 'b16', 'b32', 'b64',
      'char', 'string', 'cstring',
      'intptr', 'uintptr', 'rawptr',
      'typeid', 'void', 'unknown', 'error',
    ),

    self_type: $ => 'Self',

    qualified_type: $ => seq(
      field('namespace', $.identifier),
      '::',
      field('name', alias($.identifier, $.type_identifier)),
    ),

    pointer_type: $ => prec(PREC.UNARY, seq('^', field('element', $._type))),

    array_type: $ => seq(
      '[', field('size', $._expression), ']',
      field('element', $._type),
    ),

    dynamic_array_type: $ => seq('[', ']', field('element', $._type)),

    inferred_array_type: $ => seq('[', '?', ']', field('element', $._type)),

    slice_type: $ => seq('[', '..', ']', field('element', $._type)),

    multi_pointer_type: $ => seq('[', '^', ']', field('element', $._type)),

    sentinel_pointer_type: $ => seq(
      '[', '^', ':', field('sentinel', $._expression), ']',
      field('element', $._type),
    ),

    map_type: $ => seq(
      '[', field('key', $._type), ':', field('value', $._type), ']',
    ),

    ordered_map_type: $ => seq(
      '#ordered',
      '[', field('key', $._type), ':', field('value', $._type), ']',
    ),

    tuple_type: $ => seq('.{', commaSep1($._type), optional(','), '}'),

    function_type: $ => prec.left(seq(
      'fn',
      '(',
      commaSep($._function_type_param),
      ')',
      optional(seq(':', field('return_type', $._type))),
    )),

    _function_type_param: $ => choice(
      $._type,
      seq(field('name', $.identifier), ':', field('type', $._type)),
    ),

    generic_type: $ => seq(
      field('name', choice(alias($.identifier, $.type_identifier), $.qualified_type)),
      $.generic_arguments,
    ),

    generic_parameter_type: $ => seq('$', field('name', $.identifier)),

    optional_type: $ => prec.left(PREC.POSTFIX, seq(field('inner', $._type), '?')),

    result_type: $ => prec.left(PREC.POSTFIX, seq(
      field('inner', $._type),
      token.immediate('!'),
      optional(choice(
        field('error_type', $._type),
        seq('(', field('error_type', $._type), ')'),
      )),
    )),

    union_type: $ => prec.left(PREC.BITWISE_OR, seq(
      field('left', $._type),
      '|',
      field('right', $._type),
    )),

    soa_type: $ => seq(
      '#soa',
      optional(seq('(', 'tile', '=', $.number_literal, ')')),
      choice(
        seq('[', field('size', $._expression), ']'),
        seq('[', ']'),
      ),
      field('element', $._type),
    ),

    simd_type: $ => seq(
      'simd',
      '<', field('lanes', $._expression), ',', field('element', $._type), '>',
    ),

    anonymous_struct_type: $ => seq(
      'struct',
      '{',
      repeat($.struct_field),
      '}',
    ),

    typeof_type: $ => seq('type_of', '(', $._expression, ')'),

    parenthesized_type: $ => seq('(', $._type, ')'),

    // =====================================================================
    // STATEMENTS
    // =====================================================================

    _statement: $ => choice(
      $.variable_declaration,
      $.constant_declaration,
      $.shorthand_variable_declaration,
      $.shorthand_constant_declaration,
      $.destructuring_declaration,
      $.assignment_statement,
      $.compound_assignment_statement,
      $.expression_statement,
      $.if_statement,
      $.while_statement,
      $.until_statement,
      $.for_c_statement,
      $.for_c_shorthand_statement,
      $.for_in_statement,
      $.for_range_statement,
      $.when_statement,
      $.return_statement,
      $.break_statement,
      $.continue_statement,
      $.goto_statement,
      $.yields_statement,
      $.fallthrough_statement,
      $.unreachable_statement,
      $.defer_statement,
      $.label_statement,
      $.assert_statement,
      $.push_context_statement,
      $.undefined_block,
      $.compile_time_directive,
      $.attribute_block,
    ),

    // --- Variable Declarations ---

    variable_declaration: $ => seq(
      optional($.attribute_list),
      'mut',
      field('name', choice($.identifier, '_')),
      optional(seq(':', field('type', $._type))),
      optional(seq('=', field('value', $._expression))),
      ';',
    ),

    constant_declaration: $ => seq(
      optional($.attribute_list),
      'const',
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
      '=',
      field('value', $._expression),
      ';',
    ),

    shorthand_variable_declaration: $ => seq(
      optional($.attribute_list),
      field('name', choice($.identifier, '_')),
      ':=',
      field('value', $._expression),
      ';',
    ),

    shorthand_constant_declaration: $ => seq(
      optional($.attribute_list),
      field('name', $.identifier),
      '::=',
      field('value', $._expression),
      ';',
    ),

    destructuring_declaration: $ => seq(
      optional(choice('const', 'mut')),
      '{',
      commaSep1($.destructuring_binding),
      '}',
      '=',
      field('value', $._expression),
      ';',
    ),

    destructuring_binding: $ => seq(
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
    ),

    // --- Assignment ---

    assignment_statement: $ => seq(
      field('left', $._expression),
      '=',
      field('right', $._expression),
      ';',
    ),

    compound_assignment_statement: $ => seq(
      field('left', $._expression),
      field('operator', choice(
        '+=', '-=', '*=', '/=', '%=',
        '&=', '|=', '^=', '~=',
        '<<=', '>>=',
        '??=',
        '@+=', '@-=', '@*=', '@/=', '@<<=',
        '%+=', '%-=', '%*=', '%/=',
      )),
      field('right', $._expression),
      ';',
    ),

    expression_statement: $ => seq($._expression, ';'),

    // =====================================================================
    // CONTROL FLOW
    // =====================================================================

    if_statement: $ => prec.right(seq(
      'if',
      field('condition', $._expression),
      optional($.payload_capture),
      choice(
        seq(':', field('consequent', $._statement)),
        field('consequent', $.block),
      ),
      repeat($.elif_clause),
      optional($.else_clause),
    )),

    elif_clause: $ => seq(
      choice('elif', seq('else', 'if')),
      field('condition', $._expression),
      optional($.payload_capture),
      field('body', $.block),
    ),

    else_clause: $ => seq(
      'else',
      optional($.payload_capture),
      choice(
        seq(':', field('body', $._statement)),
        field('body', $.block),
      ),
    ),

    payload_capture: $ => seq(
      '=>',
      '[',
      choice('const', 'mut'),
      optional('^'),
      field('name', $.identifier),
      ']',
    ),

    // --- While / Until ---

    while_statement: $ => seq(
      optional($.attribute_list),
      'while',
      field('condition', $._expression),
      field('body', $.block),
    ),

    until_statement: $ => seq(
      optional($.attribute_list),
      'until',
      field('condition', $._expression),
      field('body', $.block),
    ),

    // --- For ---

    for_c_statement: $ => seq(
      optional($.attribute_list),
      'for',
      // Only support 'mut' form to avoid ambiguity with for_range_statement
      'mut',
      field('init_name', $.identifier),
      optional(seq(':', field('init_type', $._type))),
      '=',
      field('init_value', $._expression),
      ';',
      field('condition', $._expression),
      ';',
      field('update', $._expression),
      field('body', $.block),
    ),

    // Also support the := form
    for_c_shorthand_statement: $ => seq(
      optional($.attribute_list),
      'for',
      field('init_name', $.identifier),
      ':=',
      field('init_value', $._expression),
      ';',
      field('condition', $._expression),
      ';',
      field('update', $._expression),
      field('body', $.block),
    ),

    for_in_statement: $ => seq(
      optional($.attribute_list),
      'for',
      optional(field('reverse', '<-')),
      field('binding_kind', choice('const', 'mut')),
      field('binding', commaSep1(choice($.identifier, '_'))),
      'in',
      field('iterable', $._expression),
      optional(seq(';', field('step', $._expression))),
      choice(
        seq(':', field('body', $._statement)),
        field('body', $.block),
      ),
    ),

    for_range_statement: $ => seq(
      optional($.attribute_list),
      'for',
      optional(field('reverse', '<-')),
      field('range', $._expression),
      optional(seq(';', field('step', $._expression))),
      choice(
        seq(':', field('body', $._statement)),
        field('body', $.block),
      ),
    ),

    // --- When ---

    when_statement: $ => seq(
      optional($.attribute_list),
      'when',
      field('subject', $._expression),
      '{',
      repeat($.when_case),
      '}',
    ),

    when_case: $ => choice(
      seq(
        commaSep1($.when_pattern),
        optional(seq('if', field('guard', $._expression))),
        ':',
        $._when_case_body,
      ),
      seq(
        'else',
        ':',
        $._when_case_body,
      ),
    ),

    _when_case_body: $ => choice(
      seq('{', repeat($._statement), '}'),
      $._statement,
    ),

    when_pattern: $ => choice(
      $.range_pattern,
      $.type_pattern,
      $.enum_shorthand_pattern,
      $.struct_pattern,
      $.array_pattern,
      $._expression,
    ),

    range_pattern: $ => seq('in', $._expression),

    type_pattern: $ => seq('as', $._type),

    enum_shorthand_pattern: $ => seq('.', $.identifier),

    struct_pattern: $ => seq(
      field('type', choice(alias($.identifier, $.type_identifier), $.qualified_identifier)),
      '{',
      commaSep1($.struct_field_pattern),
      optional(','),
      '}',
    ),

    struct_field_pattern: $ => seq(
      field('name', $.identifier),
      optional(seq(':', field('value', $._expression))),
    ),

    array_pattern: $ => seq(
      '[',
      commaSep($.array_element_pattern),
      ']',
    ),

    array_element_pattern: $ => choice(
      $.identifier,
      $._literal,
      seq('..', optional($.identifier)),
    ),

    // --- Jump Statements ---

    return_statement: $ => seq(
      'return',
      optional(field('value', $._expression)),
      ';',
    ),

    break_statement: $ => seq('break', optional(field('label', $.identifier)), ';'),

    continue_statement: $ => seq('continue', optional(field('label', $.identifier)), ';'),

    goto_statement: $ => seq('goto', field('target', $._expression), ';'),

    yields_statement: $ => prec(1, seq(
      'yields',
      optional(field('label', $.identifier)),
      field('value', $._expression),
      ';',
    )),

    fallthrough_statement: $ => seq('fallthrough', ';'),

    unreachable_statement: $ => seq('unreachable', ';'),

    // --- Defer ---

    defer_statement: $ => seq(
      field('kind', choice('defer', 'defer_err')),
      choice(
        field('body', $.block),
        field('body', $._statement),
      ),
    ),

    // --- Label ---

    label_statement: $ => prec(1, seq(
      field('name', $.identifier),
      ':',
    )),

    // --- Assert ---

    assert_statement: $ => seq(
      field('kind', choice('assert', 'assert_db')),
      '(',
      field('condition', $._expression),
      optional(seq(',', field('message', $._expression))),
      ')',
      ';',
    ),

    // --- Push Context ---

    push_context_statement: $ => seq(
      'push_context',
      field('context', $._expression),
      field('body', $.block),
    ),

    // --- Undefined Block ---

    undefined_block: $ => seq(
      'undefined',
      '{',
      repeat($.variable_declaration),
      '}',
    ),

    // --- Test Block ---

    test_block: $ => seq(
      optional($.attribute_list),
      choice(
        seq('skip', 'test'),
        seq('test', optional('skip')),
      ),
      optional(field('name', $.string_literal)),
      field('body', $.block),
    ),

    // =====================================================================
    // EXPRESSIONS
    // =====================================================================

    _expression: $ => choice(
      $._literal,
      $.identifier,
      $.qualified_identifier,
      $.parenthesized_expression,
      $.unary_expression,
      $.address_of_expression,
      $.try_expression,
      $.spread_expression,
      $.label_address_expression,
      $.increment_expression,
      $.decrement_expression,
      $.binary_expression,
      $.call_expression,
      $.index_expression,
      $.slice_expression,
      $.field_expression,
      $.dereference_expression,
      $.arrow_expression,
      $.optional_chain_expression,
      $.ternary_expression,
      $.type_assertion_expression,
      $.range_expression,
      $.null_coalesce_expression,
      $.else_expression,
      $.payload_capture_expression,
      $.struct_init_expression,
      $.array_init_expression,
      $.map_init_expression,
      $.tuple_expression,
      $.lambda_expression,
      $.block_expression,
      $.when_expression,
      $.cast_expression,
      $.functional_cast_expression,
      $.sizeof_expression,
      $.alignof_expression,
      $.typeof_expression,
      $.typename_expression,
      $.typeid_expression,
      $.typeinfo_expression,
      $.type_assert_expression,
      $.builtin_call_expression,
      $.macro_value,
      $.compile_time_run,
      $.compile_time_code,
      $.compile_time_asm,
      $.compile_time_specialize,
      $.undefined_expression,
      $.unreachable_expression,
      $.unused_expression,
    ),

    // --- Literals ---

    _literal: $ => choice(
      $.number_literal,
      $.string_literal,
      $.raw_string_literal,
      $.char_literal,
      $.boolean_literal,
      $.null_literal,
    ),

    number_literal: $ => token(choice(
      // Hex: 0xFF_AA
      /0[xX][0-9a-fA-F][0-9a-fA-F_]*/,
      // Octal: 0q72
      /0[qQ][0-7][0-7_]*/,
      // Binary: 0b1010
      /0[bB][01][01_]*/,
      // Float with decimal digits: 3.14, 3.14f, 3.14d, 12.0
      /[0-9][0-9_]*\.[0-9][0-9_]*[fdFD]?/,
      // Float with suffix only (no decimal digits): 12.f, 12.d
      /[0-9][0-9_]*\.[fdFD]/,
      // Integer: 42, 1_000_000
      /[0-9][0-9_]*/,
    )),

    string_literal: $ => seq(
      '"',
      repeat(choice(
        $.escape_sequence,
        $.string_content,
      )),
      '"',
    ),

    string_content: $ => token.immediate(prec(-1, /[^"\\]+/)),

    raw_string_literal: $ => /`[^`]*`/,

    char_literal: $ => seq(
      "'",
      choice($.escape_sequence, $.char_content),
      "'",
    ),

    char_content: $ => token.immediate(/[^'\\]/),

    escape_sequence: $ => token.immediate(seq(
      '\\',
      choice(
        /[nrtfv\\'"0]/,
        /x[0-9a-fA-F]{2}/,
        /u\{[0-9a-fA-F]+\}/,
      ),
    )),

    boolean_literal: $ => choice('true', 'false'),

    null_literal: $ => 'null',

    undefined_expression: $ => 'undefined',

    unreachable_expression: $ => prec(-10, 'unreachable'),

    // --- Identifiers ---

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    qualified_identifier: $ => prec(PREC.POSTFIX, seq(
      field('namespace', $.identifier),
      '::',
      field('name', $.identifier),
    )),

    // --- Grouped ---

    parenthesized_expression: $ => seq('(', $._expression, ')'),

    // --- Unary Prefix ---

    unary_expression: $ => prec.right(PREC.UNARY, seq(
      field('operator', choice('-', '!', '~')),
      field('operand', $._expression),
    )),

    address_of_expression: $ => prec.right(PREC.UNARY, seq(
      '&',
      field('operand', $._expression),
    )),

    try_expression: $ => prec.right(PREC.UNARY, seq(
      'try',
      field('operand', $._expression),
    )),

    spread_expression: $ => prec.right(PREC.UNARY, seq(
      '...',
      field('operand', $._expression),
    )),

    label_address_expression: $ => prec.right(PREC.UNARY, seq(
      '@@',
      field('label', $.identifier),
    )),

    increment_expression: $ => choice(
      prec.right(PREC.UNARY, seq(
        field('operator', choice('++', '@++', '%++')),
        field('operand', $._expression),
      )),
      prec.left(PREC.POSTFIX, seq(
        field('operand', $._expression),
        field('operator', choice('++', '@++', '%++')),
      )),
    ),

    decrement_expression: $ => choice(
      prec.right(PREC.UNARY, seq(
        field('operator', choice('--', '@--', '%--')),
        field('operand', $._expression),
      )),
      prec.left(PREC.POSTFIX, seq(
        field('operand', $._expression),
        field('operator', choice('--', '@--', '%--')),
      )),
    ),

    // --- Binary ---

    binary_expression: $ => {
      const table = [
        ['||', PREC.LOGICAL_OR],
        ['&&', PREC.LOGICAL_AND],
        ['|', PREC.BITWISE_OR],
        ['^', PREC.BITWISE_XOR],
        ['&', PREC.BITWISE_AND],
        ['==', PREC.EQUALITY],
        ['!=', PREC.EQUALITY],
        ['<', PREC.COMPARISON],
        ['<=', PREC.COMPARISON],
        ['>', PREC.COMPARISON],
        ['>=', PREC.COMPARISON],
        ['in', PREC.COMPARISON],
        ['<<', PREC.SHIFT],
        ['>>', PREC.SHIFT],
        ['+', PREC.ADDITIVE],
        ['-', PREC.ADDITIVE],
        ['@+', PREC.ADDITIVE],
        ['@-', PREC.ADDITIVE],
        ['##', PREC.ADDITIVE],
        ['%+', PREC.ADDITIVE],
        ['%-', PREC.ADDITIVE],
        ['*', PREC.MULTIPLICATIVE],
        ['/', PREC.MULTIPLICATIVE],
        ['%', PREC.MULTIPLICATIVE],
        ['@*', PREC.MULTIPLICATIVE],
        ['@/', PREC.MULTIPLICATIVE],
        ['%*', PREC.MULTIPLICATIVE],
        ['%/', PREC.MULTIPLICATIVE],
      ];

      return choice(
        ...table.map(([op, precedence]) =>
          prec.left(precedence, seq(
            field('left', $._expression),
            field('operator', op),
            field('right', $._expression),
          )),
        ),
        // Right-associative: **
        prec.right(PREC.EXPONENTIATION, seq(
          field('left', $._expression),
          field('operator', '**'),
          field('right', $._expression),
        )),
      );
    },

    // --- Postfix ---

    call_expression: $ => prec.left(PREC.POSTFIX, seq(
      field('function', $._expression),
      '(',
      commaSep($.argument),
      optional(','),
      ')',
    )),

    argument: $ => choice(
      $._expression,
      seq(field('name', $.identifier), ':', field('value', $._expression)),
    ),

    index_expression: $ => prec.left(PREC.POSTFIX, seq(
      field('object', $._expression),
      '[',
      field('index', $._expression),
      ']',
    )),

    slice_expression: $ => prec.left(PREC.POSTFIX, seq(
      field('object', $._expression),
      '[',
      optional(field('start', $._expression)),
      choice('..=', '..<'),
      optional(field('end', $._expression)),
      ']',
    )),

    field_expression: $ => prec.left(PREC.POSTFIX, seq(
      field('object', $._expression),
      '.',
      field('field', choice($.identifier, $.number_literal)),
    )),

    dereference_expression: $ => prec.left(PREC.POSTFIX, seq(
      field('operand', $._expression),
      token.immediate('^'),
    )),

    arrow_expression: $ => prec.left(PREC.POSTFIX, seq(
      field('object', $._expression),
      '->',
      field('field', $.identifier),
    )),

    optional_chain_expression: $ => prec.left(PREC.POSTFIX, seq(
      field('object', $._expression),
      '?.',
      field('field', $.identifier),
    )),

    // --- Ternary ---

    ternary_expression: $ => prec.right(PREC.TERNARY, seq(
      field('condition', $._expression),
      '?',
      field('consequence', $._expression),
      ':',
      field('alternative', $._expression),
    )),

    // --- Type Assertion ---

    type_assertion_expression: $ => prec.left(PREC.TYPE_ASSERTION, seq(
      field('value', $._expression),
      'as',
      field('type', $._type),
      optional(seq('else', field('fallback', $._expression))),
    )),

    // --- Range ---

    range_expression: $ => prec.right(PREC.RANGE, seq(
      field('start', $._expression),
      field('operator', choice('..=', '..<')),
      field('end', $._expression),
    )),

    // --- Null Coalesce ---

    null_coalesce_expression: $ => prec.right(PREC.NULL_COALESCE, seq(
      field('left', $._expression),
      '??',
      field('right', $._expression),
    )),

    // --- Else on Expressions ---

    else_expression: $ => prec.left(PREC.ELSE_EXPR, seq(
      field('value', $._expression),
      'else',
      field('fallback', choice($._expression, $.block)),
    )),

    // --- Payload Capture ---

    payload_capture_expression: $ => prec.left(PREC.PAYLOAD, seq(
      field('value', $._expression),
      $.payload_capture,
      field('handler', $.block),
    )),

    // --- Struct Init ---

    struct_init_expression: $ => seq(
      field('type', choice(
        alias($.identifier, $.type_identifier),
        $.qualified_identifier,
      )),
      '{',
      commaSep($.struct_init_field),
      optional(','),
      '}',
    ),

    struct_init_field: $ => choice(
      seq(field('name', $.identifier), ':', field('value', $._expression)),
      field('value', $._expression),
    ),

    // --- Array Init ---

    array_init_expression: $ => seq(
      choice(
        seq('[', field('size', choice($._expression, '?')), ']', field('type', $._type)),
        seq('[', ']', field('type', $._type)),
      ),
      '{',
      commaSep($._expression),
      optional(','),
      '}',
    ),

    // --- Map Init ---

    map_init_expression: $ => seq(
      '[',
      field('key_type', $._type),
      ':',
      field('value_type', $._type),
      ']',
      '{',
      commaSep($.map_entry),
      optional(','),
      '}',
    ),

    map_entry: $ => seq(
      field('key', $._expression),
      ':',
      field('value', $._expression),
    ),

    // --- Tuple ---

    tuple_expression: $ => seq(
      '.{',
      commaSep1($._expression),
      optional(','),
      '}',
    ),

    // --- Lambda ---

    lambda_expression: $ => seq(
      'fn',
      $.parameter_list,
      optional(seq(':', field('return_type', $._type))),
      field('body', $.block),
    ),

    // --- Block Expression ---

    block_expression: $ => seq(
      field('label', $.identifier),
      ':',
      $.block,
    ),

    // --- When Expression ---

    when_expression: $ => prec(1, seq(
      'when',
      field('subject', $._expression),
      '{',
      repeat($.when_case),
      '}',
    )),

    // --- Casts ---

    cast_expression: $ => choice(
      seq('cast', '(', field('value', $._expression), ',', field('type', $._type), ')'),
      seq('recast', '(', field('value', $._expression), ',', field('type', $._type), ')'),
      seq('auto_cast', '(', field('value', $._expression), ')'),
    ),

    functional_cast_expression: $ => prec(PREC.POSTFIX, seq(
      field('type', $.primitive_type),
      '(',
      field('value', $._expression),
      ')',
    )),

    // --- Intrinsics ---

    sizeof_expression: $ => seq('size_of', '(', $._type, ')'),
    alignof_expression: $ => seq('align_of', '(', $._type, ')'),
    typeof_expression: $ => seq('type_of', '(', $._expression, ')'),
    typename_expression: $ => seq('typename_of', '(', choice($._type, $._expression), ')'),
    typeid_expression: $ => seq('typeid_of', '(', $._type, ')'),
    typeinfo_expression: $ => seq('typeinfo_of', '(', $._type, ')'),
    type_assert_expression: $ => seq('type_assert', '(', $._expression, ',', $._type, ')'),

    // --- Builtin Calls ---

    builtin_call_expression: $ => prec(PREC.POSTFIX, seq(
      field('function', alias(choice(
        // Memory operations
        'panic', 'new', 'delete', 'make', 'free',
        'append', 'prepend',
        'make_safe', 'new_safe', 'new_undefined', 'new_array',
        // Type introspection
        'name_of', 'type_info', 'inner_type',
        'fields_of', 'field_count', 'has_field', 'field_type',
        'enum_values', 'enum_names', 'enum_count',
        'is_pointer', 'is_array', 'is_slice', 'is_dynamic_array',
        'is_struct', 'is_enum', 'is_union', 'is_optional', 'is_result',
        'is_function', 'is_numeric', 'is_integer', 'is_float',
        'is_signed', 'is_unsigned', 'is_soa', 'is_const',
        'soa_fields', 'soa_stride', 'aos_to_soa', 'soa_to_aos',
      ), $.builtin_function)),
      '(',
      commaSep(choice($.argument, $._type)),
      optional(','),
      ')',
    )),

    // --- Unused ---

    unused_expression: $ => 'unused',

    // --- Macro Value ---

    macro_value: $ => seq('#', token.immediate(/[A-Za-z_][A-Za-z0-9_]*/)),

    // --- Compile-time Run ---

    compile_time_run: $ => seq('#run', choice($._expression, $.block)),

    // =====================================================================
    // BLOCKS
    // =====================================================================

    block: $ => seq('{', repeat($._statement), '}'),

    // =====================================================================
    // ATTRIBUTES
    // =====================================================================

    attribute_list: $ => prec.right(repeat1($.attribute)),

    attribute: $ => seq(
      '#[',
      commaSep1($.attribute_item),
      ']',
    ),

    attribute_item: $ => seq(
      field('name', $.identifier),
      optional(choice(
        seq('=', field('value', choice(
          $.string_literal,
          $.number_literal,
          $.boolean_literal,
          $.identifier,
        ))),
        seq('{', field('code', $._expression), '}'),
      )),
    ),

    attribute_block: $ => seq(
      $.attribute_list,
      choice($.block, $._statement),
    ),

    // =====================================================================
    // COMPILE-TIME DIRECTIVES
    // =====================================================================

    compile_time_directive: $ => choice(
      $.conditional_compilation,
      $.compile_time_insert,
      $.macro_define,
      $.macro_set,
      $.macro_unset,
      $.compile_time_assertion,
      $.compile_time_message,
      $.compile_time_for,
      $.compile_time_code,
      $.compile_time_asm,
      $.compile_time_specialize,
    ),

    conditional_compilation: $ => prec.right(seq(
      choice('#if', '#ifndef'),
      '(',
      field('condition', $._compile_time_condition),
      ')',
      field('body', $.block),
      optional(choice(
        seq('#else', field('else_body', $.block)),
        seq('#elif', '(', field('elif_condition', $._compile_time_condition), ')', field('elif_body', $.block)),
      )),
    )),

    _compile_time_condition: $ => choice(
      $.identifier,
      $.macro_value,
      $.boolean_literal,
      $._compile_time_comparison,
      $._compile_time_logical,
      $._compile_time_call,
      seq('(', $._compile_time_condition, ')'),
    ),

    _compile_time_comparison: $ => seq(
      $.identifier,
      choice('==', '!=', '<', '>', '<=', '>='),
      choice($.string_literal, $.number_literal),
    ),

    _compile_time_logical: $ => choice(
      prec.left(1, seq($._compile_time_condition, '&&', $._compile_time_condition)),
      prec.left(1, seq($._compile_time_condition, '||', $._compile_time_condition)),
      prec.right(2, seq('not', $._compile_time_condition)),
      prec.right(2, seq('!', $._compile_time_condition)),
    ),

    _compile_time_call: $ => choice(
      seq('feature', '(', $.string_literal, ')'),
      seq('target', '(', $.string_literal, ')'),
      seq('is_const', '(', $._expression, ')'),
    ),

    compile_time_insert: $ => seq('#insert', choice($._expression, $.compile_time_run), ';'),

    macro_define: $ => seq('#define', field('name', $.identifier)),

    macro_set: $ => seq('#set', field('name', $.identifier), field('value', choice(
      $._literal,
      $.identifier,
      $.qualified_identifier,
      $.macro_value,
      $.compile_time_run,
    ))),

    macro_unset: $ => seq(
      choice('#undef', '#unset'),
      field('name', $.identifier),
    ),

    compile_time_assertion: $ => seq(
      '#assert',
      '(',
      field('condition', $._expression),
      optional(seq(',', field('message', $.string_literal))),
      ')',
    ),

    compile_time_message: $ => seq(
      choice('#error', '#warn', '#info', '#todo'),
      '(',
      field('message', $.string_literal),
      ')',
    ),

    compile_time_for: $ => seq(
      '#for',
      '(',
      field('iterable', $._expression),
      ')',
      field('body', $.block),
    ),

    compile_time_code: $ => prec.right(seq('#code', choice($._expression, $.block))),

    compile_time_asm: $ => seq('#asm', field('body', $.block)),

    compile_time_specialize: $ => seq(
      choice('#specialize', '#bake_constants'),
      '(',
      commaSep1($._expression),
      ')',
    ),

    // =====================================================================
    // COMMENTS
    // =====================================================================

    line_comment: $ => token(seq('//', /.*/)),

    // Neo uses /- ... -/ for block comments
    block_comment: $ => token(seq(
      '/-',
      repeat(choice(
        /[^-]/,
        /-[^/]/,
      )),
      '-/',
    )),
  },
});
