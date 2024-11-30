// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

// Import du standard ERC20 d'OpenZeppelin
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ChessToken is ERC20, Ownable {
    // L'adresse du contrat ChessFactory pour autoriser des fonctionnalités spécifiques
    address public chessFactory;

    // Constructeur : initialise le nom, symbole et l'offre initiale
    constructor(uint256 initialSupply) ERC20("ChessToken", "CHESS") Ownable(msg.sender) {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    // Fonction pour définir l'adresse du ChessFactory (autorisé uniquement par le propriétaire)
    function setChessFactory(address _chessFactory) external onlyOwner {
        chessFactory = _chessFactory;
    }

    // Fonction spéciale pour permettre au ChessFactory de distribuer des tokens
    function mintTokens(address to, uint256 amount) external {
        require(msg.sender == chessFactory, "Only ChessFactory can mint tokens");
        _mint(to, amount);
    }

    // Fonction pour permettre aux utilisateurs de brûler leurs tokens
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
