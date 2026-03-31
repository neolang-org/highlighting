import XCTest
import SwiftTreeSitter
import TreeSitterNeo

final class TreeSitterNeoTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_neo())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Neo grammar")
    }
}
