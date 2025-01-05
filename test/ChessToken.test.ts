const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const hre = require("hardhat");

describe("ChessToken", function () {
  let chessToken: any;
  let owner: any;
  let addr1: any;
  let addr2: any;
  let initialSupply: bigint;
  const INITIAL_SUPPLY = "1000000000";

  // ===============================
  // =========== CONFIG ============
  // ===============================

  // Fixture to deploy the ChessToken contract
  async function deployChessTokenFixture() {
    [owner, addr1, addr2] = await hre.ethers.getSigners();
    initialSupply = hre.ethers.parseUnits(INITIAL_SUPPLY, 18);

    chessToken = await hre.ethers.deployContract("ChessToken", [initialSupply]);

    return { chessToken, owner, addr1, addr2, initialSupply };
  }

  // ===============================
  // ========= DEPLOYEMENT =========
  // ===============================

  describe("Deployment", function () {
    beforeEach(async function () {
      ({ chessToken, owner, initialSupply } = await loadFixture(
        deployChessTokenFixture
      ));
    });

    it("Should set the correct initial total supply", async function () {
      const totalSupply = await chessToken.totalSupply();
      expect(totalSupply).to.equal(initialSupply);
    });

    it("Should assign the entire initial supply to the owner", async function () {
      const ownerBalance = await chessToken.balanceOf(owner.address);
      expect(ownerBalance).to.equal(initialSupply);
    });

    it("Should have the correct token name", async function () {
      const name = await chessToken.name();
      expect(name).to.equal("ChessToken");
    });

    it("Should have the correct token symbol", async function () {
      const symbol = await chessToken.symbol();
      expect(symbol).to.equal("CHESS");
    });

    it("Should set the owner correctly", async function () {
      const contractOwner = await chessToken.owner();
      expect(contractOwner).to.equal(owner.address);
    });
  });

  // Group tests related to setting the ChessFactory
  describe("Setting ChessFactory", function () {
    beforeEach(async function () {
      ({ chessToken, owner, addr1 } = await loadFixture(
        deployChessTokenFixture
      ));
    });
  });

  // ===============================
  // ========= MINTTOKENS ==========
  // ===============================

  // Group tests related to minting functionality
  describe("mintTokens", function () {
    let mintAmount: bigint;
    let chessToken: any;
    let owner: any;
    let addr1: any;
    let addr2: any;
    beforeEach(async function () {
      ({ chessToken, owner, addr1, addr2 } = await loadFixture(
        deployChessTokenFixture
      ));
      mintAmount = hre.ethers.parseUnits("100", 18);
    });

    it("Should allow the Owner to mint tokens to a specified address", async function () {
      await chessToken.connect(owner).mintTokens(addr2.address, mintAmount);

      const addr2Balance = await chessToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(mintAmount);

      const totalSupply = await chessToken.totalSupply();
      expect(totalSupply).to.equal(initialSupply + mintAmount);
    });
    it("Should revert when a non Owner tries to mint tokens", async function () {
      await expect(
        chessToken.connect(addr1).mintTokens(addr2.address, mintAmount)
      ).to.be.revertedWithCustomError(chessToken, "OwnableUnauthorizedAccount");
    });

    it("Should revert when minting to the zero address", async function () {
      await expect(
        chessToken.connect(owner).mintTokens(hre.ethers.ZeroAddress, mintAmount)
      ).to.be.revertedWithCustomError(chessToken, "InvalidRecipientAddress");
    });

    it("Should revert when minting zero tokens", async function () {
      await expect(
        chessToken.connect(owner).mintTokens(addr2.address, 0)
      ).to.be.revertedWithCustomError(
        chessToken,
        "AmountMustBeGreaterThanZero"
      );
    });
  });

  // ===============================
  // ============ BURN =============
  // ===============================

  describe("burn", function () {
    let burnAmount: bigint;
    let chessToken: any;
    let owner: any;
    let addr1: any;
    beforeEach(async function () {
      ({ chessToken, owner, addr1 } = await loadFixture(
        deployChessTokenFixture
      ));
      burnAmount = hre.ethers.parseUnits("50", 18);
    });

    it("Should allow token holders to burn their own tokens", async function () {
      await chessToken.connect(owner).burn(burnAmount);

      const ownerBalance = await chessToken.balanceOf(owner.address);
      expect(ownerBalance).to.equal(initialSupply - burnAmount);

      // Check the total supply has decreased
      const totalSupply = await chessToken.totalSupply();
      expect(totalSupply).to.equal(initialSupply - burnAmount);
    });

    it("Should revert when trying to burn more tokens than the balance", async function () {
      const excessiveBurnAmount = hre.ethers.parseUnits("10000000000", 18);
      await expect(
        chessToken.connect(owner).burn(excessiveBurnAmount)
      ).to.be.revertedWith("Burn amount exceeds balance");
    });

    it("Should revert when trying to burn zero tokens", async function () {
      await expect(
        chessToken.connect(owner).burn(0)
      ).to.be.revertedWithCustomError(
        chessToken,
        "AmountMustBeGreaterThanZero"
      );
    });

    it("Should allow multiple accounts to burn their tokens independently", async function () {
      const transferAmount = hre.ethers.parseUnits("200", 18);
      await chessToken.connect(owner).transfer(addr1.address, transferAmount);

      const addr1BurnAmount = hre.ethers.parseUnits("100", 18);
      await chessToken.connect(addr1).burn(addr1BurnAmount);

      const addr1Balance = await chessToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(hre.ethers.parseUnits("100", 18));

      const totalSupply = await chessToken.totalSupply();
      const expectedTotalSupply = hre.ethers.parseUnits("999999900", 18);
      expect(totalSupply).to.equal(expectedTotalSupply);
    });
  });
});
