// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title cHERMES (Confidential HERMES)
/// @notice ERC20-like token on Base Sepolia, minted ONLY by DarkAMM.
/// @dev Standard ERC20 interface for AMM compatibility. The "confidential"
///      aspect is in the AMM math (Inco TEE encryption of pool reserves),
///      not in the token transfers themselves (those remain plaintext for
///      composability).
contract cHERMES {
    string  public constant name     = "Confidential HERMES";
    string  public constant symbol   = "cHERMES";
    uint8   public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public minter; // DarkAMM
    address public owner;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MinterSet(address indexed newMinter);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyMinter() {
        require(msg.sender == minter, "Only minter");
        _;
    }

    /// @notice Set minter (DarkAMM). One-way for safety: can only be set, not changed.
    function setMinter(address _minter) external onlyOwner {
        require(minter == address(0), "Minter already set");
        require(_minter != address(0), "Zero minter");
        minter = _minter;
        emit MinterSet(_minter);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        owner = newOwner;
    }

    // ─── Mint/Burn (DarkAMM only) ───────────────────────────────
    function mint(address to, uint256 amount) external onlyMinter {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyMinter {
        require(balanceOf[from] >= amount, "Insufficient");
        balanceOf[from] -= amount;
        totalSupply    -= amount;
        emit Transfer(from, address(0), amount);
    }

    // ─── Standard ERC20 ─────────────────────────────────────────
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "Insufficient allowance");
        require(balanceOf[from] >= amount, "Insufficient");

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
