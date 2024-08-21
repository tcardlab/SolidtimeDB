import { Identity, Address } from '@clockworklabs/spacetimedb-sdk';

type SumValue = any; // Placeholder
type ProductValue = any; // Placeholder

interface SchemaElement {
  name: { some: string };
  algebraic_type: AlgebraicType;
}

interface Schema {
  elements: SchemaElement[];
}

type AlgebraicType = 
  | { Product: { elements: SchemaElement[] } }
  | { Sum: { variants: SchemaElement[] } }
  | { Builtin: BuiltinType }
  | { Ref: number };

type BuiltinType = 
  | { Bool: [] }
  | { String: [] }
  | { Byte: [] }
  | { I8: [] }
  | { U8: [] }
  | { I16: [] }
  | { U16: [] }
  | { I32: [] }
  | { U32: [] }
  | { I64: [] }
  | { U64: [] }
  | { I128: [] }
  | { U128: [] }
  | { F32: [] }
  | { F64: [] }
  | { UInt8Array: [] }
  | { Array: AlgebraicType }
  | { Map: { key: AlgebraicType, value: AlgebraicType } };


let schema = {
  "elements": [
        {
          "name": {
            "some": "sender"
          },
          "algebraic_type": {
            "Product": {
              "elements": [
                {
                  "name": {
                    "some": "__identity_bytes"
                  },
                  "algebraic_type": {
                    "Builtin": {
                      "Array": {
                        "Builtin": {
                          "U8": []
                        }
                      }
                    }
                  }
                }
              ]
            }
          }
        },
        {
          "name": {
            "some": "sent"
          },
          "algebraic_type": {
            "Builtin": {
              "U64": []
            }
          }
        },
        {
          "name": {
            "some": "text"
          },
          "algebraic_type": {
            "Builtin": {
              "String": []
            }
          }
        }
  ]
}

let value = [
  [

      "6d8502416f091c64f913323a179649bd0ead148c4ee2bb5ae3ad41553b3efb28"
  ],
  1722461322919561,
  "hi"
]



export function convertValue(schema: Schema, value: any, typeSpace?: AlgebraicType[]): Record<string, any> {
  const result: Record<string, any> = {};

  // hmmm
  // if (!schema.elements.length) return null

  schema.elements.forEach((element, index) => {
    const elementValue = Array.isArray(value) ? value[index] : value[element.name.some];
    result[element.name.some] = convertElement(element.algebraic_type, elementValue, element.name.some, typeSpace);
  });

  return result;
}


function convertSum(sumType: { variants: SchemaElement[] }, value: Record<string, any[]>, typeSpace?: AlgebraicType[]): SumValue {
  // value = {"1": [some_value]}
  let arr_val = Object.entries(value).flat()
  if (!Array.isArray(arr_val) || arr_val.length !== 2) {
    throw new Error(`Invalid sum value format ( expects: {"1": [some_value]} ): ${JSON.stringify(value)}`);
  }

  const [stringIndex, variantValue] = arr_val;
  const variantIndex = +stringIndex
  if (variantIndex < 0 || variantIndex >= sumType.variants.length) {
    throw new Error(`Invalid variant index: ${stringIndex}`);
  }

  const variant = sumType.variants[variantIndex];

  // idk if this is okay...
  // perhaps if elements array is empty return null?
  /* if (variant.name.some === 'none') {
    return null
  } */

  const convertedValue = convertElement(variant.algebraic_type, variantValue, variant.name.some, typeSpace);

  /* return {
    variantIndex,
    variantName: variant.name.some,
    value: convertedValue
  }; */
  return convertedValue
}

function convertRef(refIndex: number, value: any, typeSpace?: AlgebraicType[]): any {
  if (!typeSpace || refIndex < 0 || refIndex >= typeSpace.length) {
    throw new Error(`Invalid type reference: ${refIndex}`);
  }
  const referencedType = typeSpace[refIndex];
  return convertElement(referencedType, value, undefined, typeSpace);
}

function convertElement(type: AlgebraicType, value: any, name?: string, typeSpace?: AlgebraicType[]): any {
  if ('Product' in type) {
    // still not sure how to handle SumType "none"
    if (!type.Product.elements.length) return null

    const productResult = convertValue({ elements: type.Product.elements }, value, typeSpace);
    if ('__identity_bytes' in productResult) {
      return Identity.fromString(productResult.__identity_bytes);
    }
    if ('__address_bytes' in productResult) {
      return Address.fromString(productResult.__address_bytes);
    }
    return productResult as ProductValue;
  } else if ('Sum' in type) {
    return convertSum(type.Sum, value, typeSpace);
  } else if ('Builtin' in type) {
    return convertBuiltin(type.Builtin, value, name);
  } else if ('Ref' in type) {
    return convertRef(type.Ref, value, typeSpace);
  }
  throw new Error('Unknown type');
}

function convertBuiltin(type: BuiltinType, value: any, name?: string): any {
  // Catch before Array Type
  if (name && ['__identity_bytes', '__address_bytes'].includes(name)) {
    return value
  }

  if ('Bool' in type) return Boolean(value);
  if ('String' in type) return String(value);
  if ('Byte' in type || 'I8' in type || 'U8' in type || 'I16' in type || 'U16' in type || 
      'I32' in type || 'U32' in type || 'F32' in type || 'F64' in type) {
    return Number(value);
  }
  if ('I64' in type || 'U64' in type || 'I128' in type || 'U128' in type) {
    return BigInt(value);
  }
  if ('UInt8Array' in type) {
    return new Uint8Array(value);
  }
  if ('Array' in type) {
    return value.map((v: any) => convertElement(type.Array, v));
  }
  if ('Map' in type) {
    return new Map(Object.entries(value).map(([k, v]) => [
      convertElement(type.Map.key, k),
      convertElement(type.Map.value, v)
    ]));
  }
  
  throw new Error('Unknown builtin type');
}


if (import.meta.main) {
  const result = convertValue(schema as any, value);
  console.log(result);
  console.log(result.sender.toHexString());

  let sch = {
    "elements": [
      {
        "name": { "some": "user" },
        "algebraic_type": {
          "Product": {
            "elements": [
              {
                "name": { "some": "id" },
                "algebraic_type": {
                  "Product": {
                    "elements": [
                      {
                        "name": { "some": "__identity_bytes" },
                        "algebraic_type": {
                          "Builtin": {
                            "Array": {
                              "Builtin": { "U8": [] }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              },
              {
                "name": { "some": "name" },
                "algebraic_type": { "Builtin": { "String": [] } }
              }
            ]
          }
        }
      },
      {
        "name": { "some": "account_balance" },
        "algebraic_type": { "Builtin": { "U64": [] } }
      },
      {
        "name": { "some": "account_type" },
        "algebraic_type": {
          "Sum": {
            "variants": [
              {
                "name": { "some": "Personal" },
                "algebraic_type": { "Product": { "elements": [] } }
              },
              {
                "name": { "some": "Business" },
                "algebraic_type": {
                  "Product": {
                    "elements": [
                      {
                        "name": { "some": "company_name" },
                        "algebraic_type": { "Builtin": { "String": [] } }
                      }
                    ]
                  }
                }
              }
            ]
          }
        }
      },
      {
        "name": { "some": "permissions" },
        "algebraic_type": { "Ref": 0 }
      }
    ]
  }

  let val = [
    [
      [
        "6d8502416f091c64f913323a179649bd0ead148c4ee2bb5ae3ad41553b3efb28"
      ],
      "John Doe"
    ],
    "1000000000000",
    {
      "1": ["Acme Corp"]
    },
    ["read", "write"]
  ]

  const typeSpace: AlgebraicType[] = [
    {
      "Builtin": {
        "Array": {
          "Builtin": { "String": [] }
        }
      }
    }
  ];

  const result2 = convertValue(sch as any, val, typeSpace);
  console.log(result2);
}
