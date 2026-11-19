import QtQuick
import QtTest
import "../../TimeboxNotes.js" as Notes

// Run: QT_QPA_PLATFORM=offscreen /usr/lib/qt6/bin/qmltestrunner -input tests/qml
// Drives a rich-text TextEdit the way Timebox.qml's notes boxes do (TimeboxNotes.js).
Item {
  width: 400; height: 300

  TextEdit {
    id: edit
    anchors.fill: parent
    textFormat: TextEdit.RichText
    onActiveFocusChanged: Notes.focusChanged(edit, activeFocus)
    Keys.onReturnPressed: function(event) { Notes.returnPressed(edit, event) }
  }
  Item { id: elsewhere; focus: false; activeFocusOnTab: true }

  TestCase {
    name: "NotesList"
    when: windowShown

    function plain() {
      var t = edit.getText(0, edit.length)
      return t.split(String.fromCharCode(0x2028)).join("\n").split(String.fromCharCode(0x2029)).join("\n")
    }

    function init() { elsewhere.forceActiveFocus(); edit.text = "" }

    function test_an_empty_box_starts_with_a_dash_and_lines_continue_it() {
      edit.forceActiveFocus()
      compare(plain(), "- ")
      keyClick(Qt.Key_A); keyClick(Qt.Key_B)
      keyClick(Qt.Key_Return)
      keyClick(Qt.Key_C)
      compare(plain(), "- ab\n- c")
    }

    function test_return_on_an_empty_dash_ends_the_list() {
      edit.forceActiveFocus()
      keyClick(Qt.Key_A)
      keyClick(Qt.Key_Return)
      keyClick(Qt.Key_Return)
      keyClick(Qt.Key_X)
      compare(plain(), "- a\nx")
    }

    function test_leaving_an_untouched_box_empties_it() {
      edit.forceActiveFocus()
      elsewhere.forceActiveFocus()
      compare(edit.length, 0)
    }

    function test_existing_dash_notes_continue_too() {
      edit.text = "<p>- one</p>"
      edit.forceActiveFocus()
      edit.cursorPosition = edit.length
      keyClick(Qt.Key_Return)
      keyClick(Qt.Key_T)
      compare(plain(), "- one\n- t")
    }

    function test_plain_lines_are_left_alone() {
      edit.text = "<p>FOR TOMORROW:</p>"
      edit.forceActiveFocus()
      edit.cursorPosition = edit.length
      keyClick(Qt.Key_Return)
      keyClick(Qt.Key_Z)
      compare(plain(), "FOR TOMORROW:\nz")
    }
  }
}
