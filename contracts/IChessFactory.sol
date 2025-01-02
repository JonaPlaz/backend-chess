// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/**
 * @title IChessFactory
 * @dev Interface for the ChessFactory contract to interact with ChessTemplate.
 */
interface IChessFactory {
    function distributeRewards(
        address player1,
        address player2,
        address winner,
        uint256 platformFee,
        uint256 reward
    ) external;
}
