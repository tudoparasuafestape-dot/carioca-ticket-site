// Test-only oracle: exact function bodies from CTProdutoresCore.js. No services or records.
// Upstream: tudoparasuafestape-dot/carioca-ticket @ 6424c21576d929229598e01c9ce54d4b4111c418
function ctProdutorSomenteDigitos_(
  valor
) {

  return String(
    valor || ''
  ).replace(
    /\D/g,
    ''
  );
}

function ctProdutorCpfCnpjValido_(valor) {

  var numero =
    ctProdutorSomenteDigitos_(
      valor
    );


  if (
    numero.length === 11
  ) {

    return ctProdutorCpfValido_(
      numero
    );
  }


  if (
    numero.length === 14
  ) {

    return ctProdutorCnpjValido_(
      numero
    );
  }


  return false;
}

function ctProdutorCpfValido_(cpf) {

  cpf =
    ctProdutorSomenteDigitos_(
      cpf
    );


  if (
    cpf.length !== 11 ||
    /^(\d)\1{10}$/.test(
      cpf
    )
  ) {

    return false;
  }


  var soma = 0;

  var i;


  for (
    i = 0;
    i < 9;
    i++
  ) {

    soma +=
      Number(
        cpf.charAt(i)
      ) *
      (10 - i);
  }


  var resto =
    (soma * 10) % 11;


  if (resto === 10) {

    resto = 0;
  }


  if (
    resto !==
    Number(
      cpf.charAt(9)
    )
  ) {

    return false;
  }


  soma = 0;


  for (
    i = 0;
    i < 10;
    i++
  ) {

    soma +=
      Number(
        cpf.charAt(i)
      ) *
      (11 - i);
  }


  resto =
    (soma * 10) % 11;


  if (resto === 10) {

    resto = 0;
  }


  return (
    resto ===
    Number(
      cpf.charAt(10)
    )
  );
}

function ctProdutorCnpjValido_(cnpj) {

  cnpj =
    ctProdutorSomenteDigitos_(
      cnpj
    );


  if (
    cnpj.length !== 14 ||
    /^(\d)\1{13}$/.test(
      cnpj
    )
  ) {

    return false;
  }


  var numeros =
    cnpj
      .split('')
      .map(
        function(item) {

          return Number(
            item
          );
        }
      );


  var pesos1 = [
    5, 4, 3, 2,
    9, 8, 7, 6,
    5, 4, 3, 2
  ];


  var soma1 = 0;


  for (
    var i = 0;
    i < 12;
    i++
  ) {

    soma1 +=
      numeros[i] *
      pesos1[i];
  }


  var resto1 =
    soma1 % 11;


  var digito1 =
    resto1 < 2
      ? 0
      : 11 - resto1;


  if (
    numeros[12] !==
    digito1
  ) {

    return false;
  }


  var pesos2 = [
    6, 5, 4, 3, 2,
    9, 8, 7, 6,
    5, 4, 3, 2
  ];


  var soma2 = 0;


  for (
    var j = 0;
    j < 13;
    j++
  ) {

    soma2 +=
      numeros[j] *
      pesos2[j];
  }


  var resto2 =
    soma2 % 11;


  var digito2 =
    resto2 < 2
      ? 0
      : 11 - resto2;


  return (
    numeros[13] ===
    digito2
  );
}
