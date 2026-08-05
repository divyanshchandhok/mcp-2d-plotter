; Sample G-code for CoreXY plotter simulation
; Draws a square with an X inside — demonstrates pure X, pure Y, and diagonal moves
; Bed: 200x200mm, centered at (100,100)
; Pen down: Z=0, Pen up: Z=5

G21 ; Set units to millimeters
G90 ; Set to absolute positioning

; Move to start position (pen up)
G0 Z5 F3000
G0 X50 Y50 F3000
G0 Z0 F1000

; Draw square (bottom-left -> bottom-right -> top-right -> top-left -> bottom-left)
G1 X150 Y50 F3000
G1 X150 Y150 F3000
G1 X50 Y150 F3000
G1 X50 Y50 F3000

; Draw first diagonal (bottom-left -> top-right)
G1 X150 Y150 F3000

; Pen up, move to top-left
G0 Z5 F3000
G0 X50 Y150 F3000
G0 Z0 F1000

; Draw second diagonal (top-left -> bottom-right)
G1 X150 Y50 F3000

; Pen up, return to origin
G0 Z5 F3000
G0 X0 Y0 F3000

; End
M5 ; Stop spindle (pen up)
M2 ; Program end
