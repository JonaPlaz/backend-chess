// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/**
 * @title IChessTemplate
 * @dev Interface for the ChessTemplate contract.
 */
interface IChessTemplate {
    function initialize(address _factory) external;
    function setPlayer1(address _player1) external;
    function setPlayer2(address _player2) external;
    function setGameActive() external;
    function isGameActive() external view returns (bool);
}
