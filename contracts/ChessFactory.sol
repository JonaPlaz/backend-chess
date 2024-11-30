// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./ChessTemplate.sol";

contract ChessFactory {
    address public templateAddress;
    address[] public games;
    mapping(address => address) public playerToGame;

    event GameCreated(address indexed gameAddress, address player1, address player2, uint256 betAmount);

    constructor(address _templateAddress) {
        templateAddress = _templateAddress;
    }

    function createGame(address player2, uint256 betAmount) external payable {
        require(msg.value == betAmount, "Incorrect bet amount");
        require(playerToGame[msg.sender] == address(0), "Already in a game");

        address clone = Clones.clone(templateAddress);
        ChessTemplate(clone).initialize(msg.sender, player2, betAmount);

        games.push(clone);
        playerToGame[msg.sender] = clone;
        playerToGame[player2] = clone;

        emit GameCreated(clone, msg.sender, player2, betAmount);
    }

    function getGames() external view returns (address[] memory) {
        return games;
    }
}
