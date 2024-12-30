const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const ChessModule = buildModule("ChessModule", (m) => {
  // Déploiement de ChessControl
  const chessControl = m.contract("ChessControl");

  // Déploiement de ChessToken avec une offre initiale de 1 000 000 000 000
  const chessToken = m.contract("ChessToken", [1000000000000]);

  // Déploiement de ChessTemplate (le modèle utilisé pour les clones)
  const chessTemplate = m.contract("ChessTemplate");

  // Déploiement de ChessFactory avec l'adresse du template
  const chessFactory = m.contract("ChessFactory", [chessTemplate]);

  return { chessControl, chessToken, chessTemplate, chessFactory };
});

module.exports = ChessModule;
